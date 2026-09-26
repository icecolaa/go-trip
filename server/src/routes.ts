/** GoTrip 容器代理层（rdb 直连架构，2026-09-26）。
 *
 * 数据已迁移到 CloudBase 数据模型（小程序 models.* 直连，_openid 行级隔离）。
 * 容器不再连接任何数据库，只承载必须守密钥的活：
 *   - AI（GLM key）：攻略解析 / 行程生成 / 锦囊生成 / 使用助手 / 飞哪儿建议
 *   - FlyWhere（FLYAI key）：航班低价探索
 *   - 高德（AMAP key）：POI 搜索 + 批量地理编码
 *   - Open-Meteo：天气
 *
 * 身份门槛：x-wx-source 头由微信 callContainer 专线注入，公网直连会被网关剥离
 * （2026-09-25 实测），缺失即 403——公网白嫖 AI/高德 key 的路被堵死。
 * 价格记忆已移到客户端（gt_flywhere_watch 按用户私有），分享读暂缓（待 API Key）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, json, readBody } from './util.ts';
import { searchPois, geocodePlaces, cleanActivityQuery, type GeocodeItem } from './poi.ts';
import { getWeather } from './weather.ts';
import { parseGuide, generatePlan, aiConfigured } from './ai.ts';
import { buildHandbook, aiHandbook } from './handbook.ts';
import { answerUsageQuestion, sanitizeHistory } from './assistant.ts';
import { flywhereSearch, flywhereAiAdvice, flyaiConfigured, feePolicy as flywhereFeePolicy } from './flywhere.ts';

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => Promise<void> | void;

const ROUTES: { method: string; pattern: string; handler: Handler }[] = [];

function route(method: string, pattern: string, handler: Handler): void {
  ROUTES.push({ method, pattern, handler });
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = (req.url || '/').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const params = matchPath(r.pattern, url);
    if (!params) continue;
    if (!String(req.headers['x-wx-source'] || '')) {
      json(res, 403, { error: '非微信通道调用已拒绝' });
      return true;
    }
    const body = method === 'GET' ? undefined : await readBody(req);
    await r.handler(req, res, params, body);
    return true;
  }
  return false;
}

function matchPath(pattern: string, url: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const up = url.split('/').filter(Boolean);
  if (pp.length !== up.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(up[i]);
    else if (pp[i] !== up[i]) return null;
  }
  return params;
}

function queryOf(req: IncomingMessage): URLSearchParams {
  return new URLSearchParams((req.url || '').split('?')[1] || '');
}

/* ==================== AI：攻略解析 / 行程生成 ==================== */
// 返回纯数据，不落库——写入由客户端执行（保证 _openid 归属）

route('POST', '/api/ai/parse-guide', async (_req, res, _p, body) => {
  const text = String(body.text || '');
  if (!text.trim()) throw new ApiError(400, '请粘贴攻略文本');
  json(res, 200, await parseGuide(text));
});

route('POST', '/api/ai/generate', async (_req, res, _p, body) => {
  const city = String(body.city || '').trim().slice(0, 40);
  if (!city) throw new ApiError(400, '请填写目的地');
  json(res, 200, await generatePlan({
    city,
    days: Number(body.days) || 3,
    pace: body.pace,
    interests: Array.isArray(body.interests) ? body.interests.map(String).slice(0, 6) : [],
  }));
});

// 兼容旧路径（带 tripId）：服务端不再校验成员关系，仅作通道
route('POST', '/api/trips/:id/ai/parse-guide', async (_req, res, _p, body) => {
  const text = String(body.text || '');
  if (!text.trim()) throw new ApiError(400, '请粘贴攻略文本');
  json(res, 200, await parseGuide(text));
});

route('POST', '/api/trips/:id/ai/generate', async (_req, res, _p, body) => {
  const city = String(body.city || '').trim().slice(0, 40);
  if (!city) throw new ApiError(400, '请填写目的地');
  json(res, 200, await generatePlan({
    city,
    days: Number(body.days) || 3,
    pace: body.pace,
    interests: Array.isArray(body.interests) ? body.interests.map(String).slice(0, 6) : [],
  }));
});

/** 批量地理编码：客户端写完活动后调用，回填坐标（高德优先，内置城市库兜底）。
 * 输入 items: [{ id, title, place?, city? }]，输出 coords: { [id]: {lat,lng} } */
route('POST', '/api/poi/geocode', async (_req, res, _p, body) => {
  const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const pending: GeocodeItem[] = items
    .filter((it: any) => it && String(it.title || '').trim())
    .map((it: any) => ({ id: String(it.id), query: cleanActivityQuery(String(it.title)), alt: it.place || undefined, city: it.city || undefined }));
  const coords = await geocodePlaces(pending).catch(() => new Map<string, { lat: number; lng: number }>());
  const out: Record<string, { lat: number; lng: number }> = {};
  for (const [id, c] of coords) out[id] = { lat: c.lat, lng: c.lng };
  json(res, 200, { coords: out });
});

/* ==================== 锦囊（AI 生成，返回纯数据） ==================== */

route('POST', '/api/trips/:id/handbook/generate', async (_req, res, _p, body) => {
  const city = String(body.city || '').trim().slice(0, 40) || '目的地';
  const interests = Array.isArray(body.interests) ? body.interests.map(String).slice(0, 6) : [];
  const days = Math.max(1, Math.min(30, Number(body.days) || 3));
  const cards = await aiHandbook(city, days, interests).catch(() => null);
  json(res, 200, cards || buildHandbook(city));
});

/* ==================== 使用助手 ==================== */

route('POST', '/api/assistant', async (_req, res, _p, body) => {
  const history = sanitizeHistory(body.history);
  const answer = await answerUsageQuestion(history);
  json(res, 200, answer);
});

route('GET', '/api/ai/status', async (_req, res) => {
  json(res, 200, { configured: aiConfigured() });
});

/* ==================== 飞哪儿 ==================== */

route('POST', '/api/flywhere/search', async (_req, res, _p, body) => {
  const query = {
    origin: String(body.origin || '北京').slice(0, 20),
    destination: body.destination ? String(body.destination).slice(0, 20) : '',
    trip: body.trip === 'oneway' ? 'oneway' : 'round',
    depDate: String(body.depDate || ''), backDate: String(body.backDate || ''),
    outTimeStart: String(body.outTimeStart || '').slice(0, 5), outTimeEnd: String(body.outTimeEnd || '').slice(0, 5),
    backTimeStart: String(body.backTimeStart || '').slice(0, 5), backTimeEnd: String(body.backTimeEnd || '').slice(0, 5),
    passengers: Math.max(1, Math.min(9, Number(body.passengers) || 1)),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.depDate)) throw new ApiError(400, '请选择有效的出发日期');
  if (!flyaiConfigured()) throw new ApiError(400, '未配置飞猪 API Key（环境变量 FLYAI_API_KEY），无法查询真实航班');
  let results: any[];
  try {
    results = await flywhereSearch(query);
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    console.error('[flywhere] 航班查询未知异常:', e);
    throw new ApiError(502, '航班查询暂时不可用，请稍后重试');
  }
  // 为前 6 个目的城市附带天气，失败不阻塞；价格记忆已移到客户端（gt_flywhere_watch）
  const citySeen = new Set<string>();
  for (const item of results) {
    if (citySeen.size >= 6) break;
    const city = item.city;
    if (!city || citySeen.has(city)) continue;
    citySeen.add(city);
    try {
      item.weather = await getWeather(city, [item.date, item.backDate || item.date].filter(Boolean));
    } catch { /* 天气失败不阻塞 */ }
  }
  json(res, 200, { results, count: results.length, minPrice: results[0]?.totalPrice ?? null, trend: null });
});

route('GET', '/api/flywhere/fee-policy', async (_req, res) => {
  json(res, 200, flywhereFeePolicy);
});

route('POST', '/api/flywhere/ai-advice', async (_req, res, _p, body) => {
  json(res, 200, await flywhereAiAdvice(body));
});

/* ==================== POI / 天气 ==================== */

route('GET', '/api/poi/search', async (req, res) => {
  const q = queryOf(req);
  json(res, 200, await searchPois(q.get('q') || '', q.get('city') || undefined));
});

route('GET', '/api/weather', async (req, res) => {
  const q = queryOf(req);
  const place = q.get('place') || '';
  const dates = (q.get('dates') || '').split(',').filter(Boolean).slice(0, 30);
  json(res, 200, await getWeather(place, dates));
});
