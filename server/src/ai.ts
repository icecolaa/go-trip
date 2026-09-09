import type { ParsedGuide, ActivityKind, GeneratePlanReq } from '../../shared/types.ts';
import { POIS, findCity } from './cities.ts';

const AI_BASE = (process.env.GOTRIP_AI_BASE_URL || '').replace(/\/+$/, '');
const AI_KEY = process.env.GOTRIP_AI_API_KEY || '';
const AI_MODEL = process.env.GOTRIP_AI_MODEL || '';

export function aiConfigured(): boolean {
  return !!(AI_BASE && AI_KEY && AI_MODEL);
}

/** 调用 OpenAI 兼容接口（智谱/DeepSeek/通义/Moonshot 等），导出供锦囊/助手模块复用 */
export async function chat(system: string, user: string, timeoutMs = 30000, jsonMode = true): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const body: any = {
      model: AI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
    };
    // 强制 JSON 输出：结构化任务用；纯文本对话（如使用助手）关闭
    if (jsonMode) body.response_format = { type: 'json_object' };
    const resp = await fetch(`${AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

function extractJson(text: string): any | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

function normKind(k: string | undefined): ActivityKind {
  const map: Record<string, ActivityKind> = {
    sight: 'sight', food: 'food', hotel: 'hotel', transport: 'transport',
    shopping: 'shopping', show: 'show', other: 'other',
    景点: 'sight', 美食: 'food', 住宿: 'hotel', 交通: 'transport', 购物: 'shopping', 演出: 'show',
  };
  return map[(k || '').toLowerCase()] || 'sight';
}

/* ================= 内置规则解析（离线兜底） ================= */

const KIND_HINTS: [RegExp, ActivityKind][] = [
  [/机场|航班|高铁|动车|火车|汽车站|自驾|包车|打车|起飞|抵达|出发|返程|大巴|地铁|轮渡/, 'transport'],
  [/酒店|民宿|客栈|入住|check\s*in|帐篷|营地/, 'hotel'],
  [/早餐|午餐|晚餐|早茶|下午茶|夜宵|小吃|火锅|烧烤|吃饭|餐厅|美食|尝|喝|咖啡|奶茶|甜品/, 'food'],
  [/商场|购物|超市|免税|买|采购/, 'shopping'],
  [/演出|话剧|印象|秀|剧本|KTV|酒吧|演唱会|音乐会/, 'show'],
  [/山|湖|海|寺|庙|塔|博物馆|公园|古城|古镇|岛|峡谷|瀑|林|滩|教堂|遗址|陵|故居|城墙|长城|广场|湿地|草原|雪山/, 'sight'],
];

function guessKind(title: string): ActivityKind {
  for (const [re, kind] of KIND_HINTS) {
    if (re.test(title)) return kind;
  }
  return 'sight';
}

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseDayHeader(line: string): { day: number; title: string } | null {
  let m = line.match(/^D(?:ay)?\s*(\d{1,2})[:：.、\s]*(.*)$/i);
  if (m) return { day: Number(m[1]), title: m[2]?.trim() || '' };
  m = line.match(/^第\s*(\d{1,2}|[一二三四五六七八九十]+)\s*天[:：.、\s]*(.*)$/);
  if (m) {
    const day = /^\d+$/.test(m[1]) ? Number(m[1]) : CN_NUM[m[1]] || 1;
    return { day, title: m[2]?.trim() || '' };
  }
  m = line.match(/^(\d{1,2})\s*[日号][:：.、\s]*(.*)$/);
  if (m) return { day: Number(m[1]), title: m[2]?.trim() || '' };
  return null;
}

/** 内置攻略解析：识别 Day N / 第 N 天 结构，逐行拆活动 */
export function builtinParseGuide(text: string): ParsedGuide {
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const days: ParsedGuide['days'] = [];
  let current: ParsedGuide['days'][number] | null = null;
  let seq = 0;
  for (const line of lines) {
    const header = parseDayHeader(line);
    if (header) {
      seq = header.day;
      current = { dayNumber: seq, title: header.title, place: '', activities: [] };
      // 「Day 1: 抵达大理，古城漫步」单行写法：标题同时作为当天的一项活动
      if (header.title) {
        current.activities.push({ title: header.title, kind: guessKind(header.title) });
      }
      days.push(current);
      continue;
    }
    if (!current) {
      seq += 1;
      current = { dayNumber: seq, title: '', place: '', activities: [] };
      days.push(current);
    }
    const item: ParsedGuide['days'][number]['activities'][number] = {};
    let rest = line;
    const tm = rest.match(/^([01]?\d[:：][0-5]\d)\s*[-–—~至]?\s*([01]?\d[:：][0-5]\d)?\s*/);
    if (tm) {
      item.time = tm[1].replace('：', ':');
      rest = rest.slice(tm[0].length);
    }
    rest = rest.replace(/^[-•*·\d.、)\]]+\s*/, '').trim();
    if (!rest) continue;
    item.title = rest;
    item.kind = guessKind(rest);
    current.activities.push(item);
  }
  return { days: days.filter(d => d.activities.length || d.title), source: 'builtin' };
}

/* ================= 内置行程生成（离线兜底） ================= */

const CITY_FOOD_HINTS: Record<string, string[]> = {
  大理: ['白族砂锅鱼', '喜洲粑粑', '雕梅酒'],
  丽江: ['腊排骨火锅', '野生菌火锅', '鸡豆凉粉'],
  成都: ['火锅', '串串香', '钟水饺'],
  重庆: ['老火锅', '小面', '江湖菜'],
  西安: ['羊肉泡馍', '肉夹馍', 'biangbiang面'],
  北京: ['烤鸭', '炸酱面', '豆汁焦圈'],
  长沙: ['臭豆腐', '茶颜悦色', '口味虾'],
  广州: ['早茶', '烧腊', '肠粉'],
  杭州: ['西湖醋鱼', '龙井虾仁', '片儿川'],
  三亚: ['海鲜加工', '清补凉', '椰子鸡'],
  昆明: ['过桥米线', '汽锅鸡', '菌子火锅'],
};

export function builtinGeneratePlan(req: GeneratePlanReq): ParsedGuide {
  const { city, days: n } = req;
  const pace = req.pace || '适中';
  const perDay = pace === '轻松' ? 2 : pace === '充实' ? 4 : 3;
  const pool = POIS.filter(p => p.city === city || (findCity(city)?.name === p.city));
  const interests = req.interests || [];
  const filtered = interests.length
    ? pool.filter(p => {
        const kindMap: Record<string, string[]> = {
          自然: ['山', '湖', '海', '景点', '公园', '草原', '湿地', '雪山', '森林'],
          人文: ['古城', '古镇', '博物馆', '寺', '陵', '故居', '遗址'],
          美食: ['美食'],
          亲子: ['乐园', '体验'],
          购物: ['街区', '购物'],
          打卡: ['打卡', '街区', '体验'],
        };
        const ok = interests.some(i => (kindMap[i] || []).some(k => p.kind.includes(k) || p.desc.includes(k)));
        return ok || p.kind === '景点';
      })
    : pool;
  const sights = (filtered.length ? filtered : pool).slice();
  const foods = [...(CITY_FOOD_HINTS[city] || ['当地特色菜']).map(f => `${f}`)];
  const days: ParsedGuide['days'] = [];
  let idx = 0;
  const nextSight = (): PoiLike | null => (idx < sights.length ? sights[idx++] : null);
  for (let d = 1; d <= n; d++) {
    const acts: ParsedGuide['days'][number]['activities'] = [];
    if (d === 1) {
      acts.push({ title: `抵达${city}，办理入住`, kind: 'transport', time: '14:00' });
      acts.push({ title: `${city}核心街区初逛`, kind: 'sight', time: '16:00' });
      acts.push({ title: `晚餐：${foods[0] || '当地特色'}`, kind: 'food', time: '18:30' });
    } else if (d === n) {
      const s = nextSight();
      acts.push({ title: s ? `${s.name}` : `${city}自由活动`, kind: 'sight', time: '09:30' });
      acts.push({ title: `午餐：${foods[1] || '尝尝本地老字号'}`, kind: 'food', time: '12:00' });
      acts.push({ title: '收拾行李，返程', kind: 'transport', time: '16:00' });
    } else {
      const count = perDay - 1;
      for (let k = 0; k < count; k++) {
        const s = nextSight();
        if (s) {
          acts.push({ title: s.name, kind: 'sight', time: k === 0 ? '09:30' : k === 1 ? '14:00' : '16:00', notes: s.desc });
        }
      }
      acts.push({ title: `晚餐：${foods[(d - 1) % foods.length]}`, kind: 'food', time: '18:30' });
    }
    days.push({ dayNumber: d, title: '', place: d === 1 || d === n ? city : '', activities: acts });
  }
  return { days, source: 'builtin' };
}

interface PoiLike { name: string; desc: string }

/* ================= AI 主路径 ================= */

const PARSE_SYSTEM = `你是旅行攻略结构化助手。把用户粘贴的旅行攻略文本解析成 JSON：
{"days":[{"dayNumber":1,"title":"当天主题（可空）","place":"当天主要城市/地点（可空）","activities":[{"time":"HH:mm 可空","title":"活动名称","kind":"sight|food|hotel|transport|shopping|show|other","notes":"补充可空"}]}]}
规则：识别 Day N / 第 N 天 / D N 等分天标记；无法分天时按内容合理切分；保留原文信息，不要编造具体价格；只输出 JSON。`;

const GENERATE_SYSTEM = `你是资深中国旅行规划师。为用户生成行程计划，输出 JSON：
{"days":[{"dayNumber":1,"title":"当日主题","place":"当日主要城市/地点","activities":[{"time":"HH:mm","title":"活动","kind":"sight|food|hotel|transport|shopping|show|other","notes":"提示（开放时间/交通/注意）"}]}]}
要求：节奏合理（上午 9:30 / 下午 14:00 / 晚上 18:30 左右），首日含抵达入住、末日含返程；餐饮体现当地特色；景点间交通可行；不编造门票价格；只输出 JSON。`;

/** 攻略文本 → 结构化行程（AI 优先，失败回退内置解析） */
export async function parseGuide(text: string): Promise<ParsedGuide> {
  if (aiConfigured()) {
    const out = await chat(PARSE_SYSTEM, text.slice(0, 6000), 60000);
    if (out) {
      const json = extractJson(out);
      if (json?.days?.length) {
        return {
          days: json.days.map((d: any, i: number) => ({
            dayNumber: Number(d.dayNumber) || i + 1,
            title: String(d.title || ''),
            place: String(d.place || ''),
            activities: (d.activities || []).map((a: any) => ({
              time: a.time ? String(a.time) : undefined,
              title: String(a.title || '').slice(0, 100),
              kind: normKind(a.kind),
              notes: a.notes ? String(a.notes).slice(0, 200) : undefined,
            })),
          })),
          source: 'ai',
        };
      }
    }
  }
  return builtinParseGuide(text);
}

/** 生成行程计划（AI 优先，失败回退内置模板） */
export async function generatePlan(req: GeneratePlanReq): Promise<ParsedGuide> {
  const days = Math.min(15, Math.max(1, Number(req.days) || 3));
  const interests = (req.interests || []).join('、');
  if (aiConfigured()) {
    const prompt = `目的地：${req.city}\n天数：${days} 天\n节奏：${req.pace || '适中'}\n偏好：${interests || '不限'}\n请生成行程 JSON。`;
    const out = await chat(GENERATE_SYSTEM, prompt, 45000);
    if (out) {
      const json = extractJson(out);
      if (json?.days?.length) {
        return {
          days: json.days.map((d: any, i: number) => ({
            dayNumber: Number(d.dayNumber) || i + 1,
            title: String(d.title || ''),
            place: String(d.place || req.city),
            activities: (d.activities || []).map((a: any) => ({
              time: a.time ? String(a.time) : undefined,
              title: String(a.title || '').slice(0, 100),
              kind: normKind(a.kind),
              notes: a.notes ? String(a.notes).slice(0, 200) : undefined,
            })),
          })),
          source: 'ai',
        };
      }
    }
  }
  return builtinGeneratePlan({ ...req, days });
}
