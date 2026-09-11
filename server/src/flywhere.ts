import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from './ai.ts';
import { ApiError } from './util.ts';

/* ============================================================
 * 飞哪里 FlyWhere：按票价探索目的地（移植自 icecolaa/flywhere）
 * 通过 @fly-ai/flyai-cli（随依赖安装）调用飞猪 AI 开放平台，
 * 无需单独的运行设置；API Key 从环境变量 FLYAI_API_KEY 读取。
 * ============================================================ */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLYAI_BUNDLE = path.resolve(__dirname, '../../node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs');

function flyaiApiKey(): string {
  return process.env.FLYAI_API_KEY || '';
}
export function flyaiConfigured(): boolean {
  return Boolean(FLYAI_BUNDLE && flyaiApiKey());
}

export const feePolicy = {
  airportConstruction: 50, shortHaulFuelSurcharge: 40, longHaulFuelSurcharge: 70,
  thresholdKm: 800, updatedAt: '2026-08-05',
  source: '按航段大圆距离估算；FlyAI 返回实际费用时以接口为准',
};

const airportCoordinates: Record<string, [number, number]> = {
  CAN: [113.30, 23.39], SZX: [113.81, 22.64], ZUH: [113.38, 22.01], FUO: [113.07, 23.08], HKG: [113.92, 22.31], MFM: [113.59, 22.15],
  PEK: [116.60, 40.08], PKX: [116.41, 39.51], BJS: [116.40, 39.90], SHA: [121.34, 31.20], PVG: [121.80, 31.14],
  CTU: [103.95, 30.58], TFU: [104.44, 30.31], CKG: [106.64, 29.72], XIY: [108.75, 34.45], KMG: [102.93, 25.10],
  XMN: [118.13, 24.54], FOC: [119.66, 25.93], HAK: [110.46, 19.94], SYX: [109.41, 18.30], HGH: [120.43, 30.23],
  NKG: [118.86, 31.74], WUH: [114.21, 30.78], CSX: [113.22, 28.19], CGO: [113.84, 34.52], TAO: [120.37, 36.27],
  DLC: [121.54, 38.97], SHE: [123.48, 41.64], HRB: [126.25, 45.62], URC: [87.47, 43.91], KHG: [76.02, 39.54],
  LHW: [103.62, 36.51], XNN: [101.45, 36.53], LXA: [90.91, 29.30], NNG: [108.17, 22.61], KWE: [106.80, 26.54],
  LYG: [119.18, 34.62], LJG: [100.45, 26.68], TNL: [124.87, 46.20], HLD: [119.83, 49.26],
};
const cityCoordinates: Record<string, [number, number]> = {
  喀什: airportCoordinates.KHG, 北京: airportCoordinates.BJS, 广州: airportCoordinates.CAN, 上海: airportCoordinates.SHA,
  成都: airportCoordinates.CTU, 深圳: airportCoordinates.SZX, 连云港: airportCoordinates.LYG,
  丽江: airportCoordinates.LJG, 大庆: [125.10, 46.59], 通辽: [122.26, 43.65],
};

const domesticExplorationCities = [
  '北京', '上海', '成都', '重庆', '昆明', '西安', '厦门', '福州', '泉州', '海口', '三亚', '杭州', '南京', '宁波', '温州', '武汉', '长沙', '郑州', '青岛', '济南',
  '大连', '沈阳', '长春', '哈尔滨', '贵阳', '桂林', '南宁', '北海', '珠海', '兰州', '西宁', '银川', '乌鲁木齐', '喀什', '拉萨', '大理', '丽江', '西双版纳',
  '南昌', '合肥', '太原', '石家庄', '呼和浩特', '烟台', '威海', '张家界', '宜昌', '徐州', '无锡', '常州', '扬州', '台州', '揭阳', '湛江', '惠州',
  '香港', '澳门', '台北', '高雄',
];
const domesticCitySet = new Set(['广州', '深圳', ...domesticExplorationCities]);
const explorationDestinationLimit = 10;
const minimumExplorationDestinations = 6;
const explorationFallbackAttempts = 12;

/* ---------------- FlyAI CLI 调用（串行队列 + 缓存 + 限流重试） ---------------- */

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function runFlyaiOnce(args: string[]): Promise<any> {
  const apiKey = flyaiApiKey();
  return new Promise((resolve, reject) => {
    const env = { ...process.env, FLYAI_API_KEY: apiKey };
    const child = spawn(process.execPath, [FLYAI_BUNDLE, 'search-flight', ...args], {
      env, timeout: 90000, maxBuffer: 12 * 1024 * 1024,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => reject(new Error(String(e.message))));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err.trim() || `FlyAI 退出码 ${code}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error('FlyAI 返回了无法解析的数据')); }
    });
  });
}

const flyaiCache = new Map<string, { data: any; expiresAt: number }>();
const flyaiInflight = new Map<string, Promise<any>>();
let flyaiQueue: Promise<any> = Promise.resolve();
let flyaiNextRunAt = 0;

function flyaiCacheKey(args: string[]) { return JSON.stringify(args); }
function isRateLimited(error: any) { return /\b429\b|rate limit|too many requests/i.test(String(error?.message || error)); }

function runFlyai(args: string[]): Promise<any> {
  const key = flyaiCacheKey(args);
  const cached = flyaiCache.get(key);
  if (cached?.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const inflight = flyaiInflight.get(key);
  if (inflight) return inflight;

  const task = flyaiQueue.then(async () => {
    const cooldown = Math.max(0, flyaiNextRunAt - Date.now());
    if (cooldown) await wait(cooldown);
    let lastError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await runFlyaiOnce(args);
        flyaiNextRunAt = Date.now() + 450;
        flyaiCache.set(key, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
        if (flyaiCache.size > 120) flyaiCache.delete(flyaiCache.keys().next().value as any);
        return data;
      } catch (error) {
        lastError = error;
        if (!isRateLimited(error) || attempt === 2) throw error;
        const delay = 1000 * (attempt + 1);
        flyaiNextRunAt = Date.now() + delay;
        await wait(delay);
      }
    }
    throw lastError;
  });
  flyaiQueue = task.catch(() => undefined);
  flyaiInflight.set(key, task);
  task.finally(() => flyaiInflight.delete(key)).catch(() => undefined);
  return task;
}

/* ---------------- 结果归一化与费用估算 ---------------- */

function value(item: any, keys: string[]): number | null {
  for (const key of keys) {
    const raw = item?.[key];
    if (raw !== undefined && raw !== null && raw !== '') {
      const number = Number(String(raw).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(number)) return number;
    }
  }
  return null;
}

function durationMinutes(raw: any): number {
  const minutes = Number(String(raw ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(minutes) ? minutes : 0;
}

function segmentCoordinate(segment: any, side: 'dep' | 'arr'): [number, number] | null {
  const stationCode = String(segment?.[`${side}StationCode`] || '').toUpperCase();
  const cityCode = String(segment?.[`${side}CityCode`] || '').toUpperCase();
  const cityName = String(segment?.[`${side}CityName`] || '').trim();
  return airportCoordinates[stationCode] || airportCoordinates[cityCode] || cityCoordinates[cityName] || null;
}

function greatCircleDistanceKm(from: [number, number] | null, to: [number, number] | null): number | null {
  if (!from || !to) return null;
  const radians = (v: number) => v * Math.PI / 180;
  const [fromLng, fromLat] = from, [toLng, toLat] = to;
  const latDelta = radians(toLat - fromLat);
  const lngDelta = radians(toLng - fromLng);
  const arc = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(lngDelta / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)));
}

function estimatedSegmentFee(segment: any) {
  const distanceKm = greatCircleDistanceKm(segmentCoordinate(segment, 'dep'), segmentCoordinate(segment, 'arr'));
  if (!Number.isFinite(distanceKm)) return null;
  const fuelSurcharge = (distanceKm as number) <= feePolicy.thresholdKm ? feePolicy.shortHaulFuelSurcharge : feePolicy.longHaulFuelSurcharge;
  return { distanceKm, amount: feePolicy.airportConstruction + fuelSurcharge };
}

function estimatedJourneyFee(segments: any[]) {
  const fees = segments.map(estimatedSegmentFee);
  if (!fees.length || fees.some(f => !f)) return null;
  return {
    amount: fees.reduce((total, f) => total + (f as any).amount, 0),
    distanceKm: fees.reduce((total, f) => total + (f as any).distanceKm, 0),
    segments: fees,
  };
}

export interface NormalizedFlight {
  item: any; city: string; code: string; coord: [number, number] | null;
  date: string; time: string; arrivalTime: string; airline: string;
  flightMinutes: number; elapsedMinutes: number; layoverMinutes: number;
  duration: number; direct: boolean; fare: number;
  fee: number | null; estimatedFee: ReturnType<typeof estimatedJourneyFee>; jumpUrl: string;
}

function normalize(data: any): NormalizedFlight[] {
  return (data?.data?.itemList || []).map((item: any) => {
    const journey = item?.journeys?.[0];
    const segments = journey?.segments || [];
    const first = segments[0], last = segments.at(-1);
    const flightMinutes = segments.reduce((total: number, segment: any) => total + durationMinutes(segment?.duration), 0);
    const elapsedMinutes = durationMinutes(journey?.totalDuration || item?.totalDuration) || flightMinutes;
    const airlines = [...new Set(segments.map((segment: any) => segment?.marketingTransportName).filter(Boolean))].join(' / ');
    const coord = segmentCoordinate(last, 'arr');
    return {
      item, city: last?.arrCityName, code: last?.arrCityCode, coord,
      date: first?.depDateTime?.slice(0, 10), time: first?.depDateTime?.slice(11, 16),
      arrivalTime: last?.arrDateTime?.slice(11, 16), airline: airlines,
      flightMinutes, elapsedMinutes, layoverMinutes: Math.max(0, elapsedMinutes - flightMinutes),
      duration: Number((flightMinutes / 60).toFixed(1)), direct: journey?.journeyType === '直达',
      fare: value(item, ['ticketPrice', 'adultPrice', 'price']), fee: value(item, ['taxFee', 'tax']),
      estimatedFee: estimatedJourneyFee(segments), jumpUrl: item.jumpUrl,
    };
  }).filter((item: any) => item.city && item.code && item.date && item.time && item.fare !== null);
}

function inTime(time: string, start: string, end: string) { return !start || !end || time >= start && time <= end; }
function reasonableItinerary(flight: NormalizedFlight) { return flight.direct || flight.layoverMinutes <= 4 * 60; }
function uniqueFlights(flights: NormalizedFlight[]) {
  const seen = new Set<string>();
  return flights.filter(f => {
    const key = `${f.airline}|${f.time}|${f.direct ? 'direct' : 'transfer'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedDomesticCityName(value: string) {
  return String(value || '').trim().replace(/^中国/, '').replace(/(?:特别行政区|市)$/, '');
}
function isDomesticDestination(item: NormalizedFlight) {
  return domesticCitySet.has(normalizedDomesticCityName(item?.city));
}
function stableExplorationTargets(query: FlightQuery, existingCities: Set<string>) {
  const origin = normalizedDomesticCityName(query.origin || '广州');
  const pool = domesticExplorationCities.filter(city => city !== origin && !existingCities.has(city));
  const seed = `${origin}|${query.depDate || ''}|${query.backDate || ''}`;
  const hash = [...seed].reduce((v, ch) => ((v * 31) + ch.charCodeAt(0)) >>> 0, 0);
  const offset = pool.length ? hash % pool.length : 0;
  return [...pool.slice(offset), ...pool.slice(0, offset)];
}
function domesticPriceSort(a: any, b: any) {
  return Number(!isDomesticDestination(a)) - Number(!isDomesticDestination(b)) || Number(a.totalPrice ?? a.fare) - Number(b.totalPrice ?? b.fare);
}
function roundTripCombinations(outboundOptions: NormalizedFlight[], inboundOptions: NormalizedFlight[], query: FlightQuery) {
  const combinations: any[] = [];
  for (const out of outboundOptions) for (const back of inboundOptions) {
    if (out.layoverMinutes + back.layoverMinutes <= 4 * 60) combinations.push(makeResult(out, back, query));
  }
  return combinations;
}

/* ---------------- 搜索入口 ---------------- */

export interface FlightQuery {
  origin?: string; destination?: string; trip?: 'round' | 'oneway';
  depDate: string; backDate?: string;
  outTimeStart?: string; outTimeEnd?: string;
  backTimeStart?: string; backTimeEnd?: string;
  passengers?: number; model?: string;
}

function airportFee(item: NormalizedFlight) {
  if (item.fee !== null) return { amount: item.fee, source: '接口', distanceKm: null as number | null };
  if (item.estimatedFee) return { amount: item.estimatedFee.amount, source: '航程估算', distanceKm: item.estimatedFee.distanceKm as number | null };
  return { amount: feePolicy.airportConstruction + feePolicy.longHaulFuelSurcharge, source: '兜底估算', distanceKm: null as number | null };
}

function makeResult(outbound: NormalizedFlight, inbound: NormalizedFlight | null, query: FlightQuery) {
  const people = Math.max(1, Number(query.passengers || 1));
  const outboundFee = airportFee(outbound);
  const inboundFee = inbound ? airportFee(inbound) : { amount: 0, source: '预估', distanceKm: null as number | null };
  const feeItems = [outboundFee, inboundFee].filter(item => item.amount > 0);
  const feeSources = [...new Set(feeItems.map(item => item.source))];
  const perPerson = outbound.fare + (inbound?.fare || 0) + outboundFee.amount + inboundFee.amount;
  const id = [outbound.code, outbound.airline, outbound.date, outbound.time, inbound?.airline || '', inbound?.date || '', inbound?.time || ''].join('::');
  const flightMinutes = outbound.flightMinutes + (inbound?.flightMinutes || 0);
  const journeyMinutes = outbound.elapsedMinutes + (inbound?.elapsedMinutes || 0);
  const transferWaitMinutes = outbound.layoverMinutes + (inbound?.layoverMinutes || 0);
  return {
    id, city: outbound.city, code: outbound.code, coord: outbound.coord, domestic: isDomesticDestination(outbound),
    date: outbound.date, backDate: inbound?.date || '',
    airline: inbound ? `${outbound.airline} / ${inbound.airline}` : outbound.airline,
    out: outbound.time, outArr: outbound.arrivalTime || '—', back: inbound?.time || '—', backArr: inbound?.arrivalTime || '—',
    direct: outbound.direct && (!inbound || inbound.direct),
    duration: Number((flightMinutes / 60).toFixed(1)), journeyDuration: Number((journeyMinutes / 60).toFixed(1)),
    fare: outbound.fare + (inbound?.fare || 0), fees: outboundFee.amount + inboundFee.amount,
    feeSource: feeSources.join(' + '),
    perPerson: Math.round(perPerson), totalPrice: Math.round(perPerson * people),
    passengers: people, jumpUrl: outbound.jumpUrl,
  };
}

function dateArgs(query: FlightQuery, prefix: 'dep' | 'back'): string[] {
  const fixedDate = query[`${prefix}Date` as keyof FlightQuery] as string | undefined;
  if (fixedDate) return ['--dep-date', fixedDate];
  const start = query[`${prefix}DateStart` as keyof FlightQuery] as string | undefined;
  const end = query[`${prefix}DateEnd` as keyof FlightQuery] as string | undefined;
  if (start && end) return ['--dep-date-start', start, '--dep-date-end', end];
  throw new ApiError(400, prefix === 'dep' ? '请选择出发日期' : '请选择回程日期');
}

function validateTripDates(query: FlightQuery) {
  const depDate = String(query.depDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depDate)) { throw new ApiError(400, '请选择有效的出发日期'); }
  if (query.trip === 'oneway') return;
  const backDate = String(query.backDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(backDate)) { throw new ApiError(400, '请选择有效的回程日期'); }
  if (backDate < depDate) { throw new ApiError(400, '回程日期不能早于出发日期'); }
}

function searchCacheKey(query: FlightQuery) {
  return JSON.stringify({
    origin: query.origin || '广州', destination: query.destination || 'all', trip: query.trip || 'round',
    depDate: query.depDate, backDate: query.backDate || '',
    outTimeStart: query.outTimeStart || '', outTimeEnd: query.outTimeEnd || '',
    backTimeStart: query.backTimeStart || '', backTimeEnd: query.backTimeEnd || '',
    passengers: query.passengers || 1, // 人数影响 totalPrice，必须参与缓存键
  });
}

const searchCache = new Map<string, { results: any[]; expiresAt: number }>();
const searchInflight = new Map<string, Promise<any[]>>();

async function searchFresh(query: FlightQuery) {
  const origin = query.origin || '广州';
  const destination = query.destination && query.destination !== 'all' ? query.destination : null;
  const common = ['--origin', origin];
  if (query.outTimeStart) common.push('--dep-hour-start', String(Number(query.outTimeStart.slice(0, 2))));
  if (query.outTimeEnd) common.push('--dep-hour-end', String(Number(query.outTimeEnd.slice(0, 2))));
  const sortTypes = ['3', '4', '2', '8'];
  const outboundSearches = await Promise.allSettled(sortTypes.map(sortType => runFlyai([...common, '--sort-type', sortType, ...(destination ? ['--destination', destination] : []), ...dateArgs(query, 'dep')])));
  const successful = outboundSearches.filter(item => item.status === 'fulfilled').map(item => item.value);
  if (!successful.length) throw (outboundSearches[0] as any)?.reason || new Error('航班查询没有返回结果');
  const outboundNormalized = successful.flatMap(normalize);
  const attemptedDomesticCities = new Set(outboundNormalized.filter(isDomesticDestination).map(item => normalizedDomesticCityName(item.city)));
  if (!destination) {
    const needed = Math.max(0, explorationDestinationLimit - attemptedDomesticCities.size);
    const targets = stableExplorationTargets(query, attemptedDomesticCities).slice(0, needed);
    targets.forEach(city => attemptedDomesticCities.add(city));
    const supplements = await Promise.allSettled(targets.map(city => runFlyai([...common, '--sort-type', '3', '--destination', city, ...dateArgs(query, 'dep')])));
    outboundNormalized.push(...supplements.filter(item => item.status === 'fulfilled').flatMap(item => normalize(item.value)));
  }
  const outbound = outboundNormalized.filter(f => inTime(f.time, query.outTimeStart || '', query.outTimeEnd || '') && reasonableItinerary(f));
  const groups = new Map<string, NormalizedFlight[]>();
  outbound.forEach(f => {
    if (!groups.has(f.code)) groups.set(f.code, []);
    groups.get(f.code)!.push(f);
  });
  const destinations = [...groups.values()]
    .sort((a, b) => Number(!isDomesticDestination(a[0])) - Number(!isDomesticDestination(b[0]))
      || Math.min(...a.map(item => item.fare)) - Math.min(...b.map(item => item.fare))
      || Math.min(...a.map(item => item.duration)) - Math.min(...b.map(item => item.duration)))
    .map(uniqueFlights);
  if (query.trip === 'oneway') {
    return destinations.flat().map(f => makeResult(f, null, query)).sort(domesticPriceSort).map((item, index) => ({ ...item, rank: index + 1 }));
  }
  const results: any[] = [];
  for (const outboundOptions of destinations) {
    const outboundItem = outboundOptions[0];
    const inboundArgs = ['--origin', outboundItem.code, '--destination', origin, '--sort-type', '3', ...dateArgs(query, 'back')];
    if (query.backTimeStart) inboundArgs.push('--dep-hour-start', String(Number(query.backTimeStart.slice(0, 2))));
    if (query.backTimeEnd) inboundArgs.push('--dep-hour-end', String(Number(query.backTimeEnd.slice(0, 2))));
    let inboundData: any;
    try { inboundData = await runFlyai(inboundArgs); } catch { continue; }
    const inboundOptions = uniqueFlights(normalize(inboundData).filter(f => inTime(f.time, query.backTimeStart || '', query.backTimeEnd || '') && reasonableItinerary(f)));
    results.push(...roundTripCombinations(outboundOptions, inboundOptions, query));
  }
  if (!destination) {
    const matchedDestinations = new Set(results.map(item => item.code));
    const fallbackTargets = stableExplorationTargets(query, attemptedDomesticCities);
    let fallbackAttempts = 0;
    for (const city of fallbackTargets) {
      if (matchedDestinations.size >= minimumExplorationDestinations || fallbackAttempts >= explorationFallbackAttempts) break;
      fallbackAttempts++;
      try {
        const outboundData = await runFlyai([...common, '--sort-type', '3', '--destination', city, ...dateArgs(query, 'dep')]);
        const outboundOptions = uniqueFlights(normalize(outboundData).filter(f => inTime(f.time, query.outTimeStart || '', query.outTimeEnd || '') && reasonableItinerary(f)));
        if (!outboundOptions.length) continue;
        const fallbackAirport = outboundOptions[0];
        const fallbackOutboundOptions = outboundOptions.filter(item => item.code === fallbackAirport.code);
        const inboundArgs = ['--origin', fallbackAirport.code, '--destination', origin, '--sort-type', '3', ...dateArgs(query, 'back')];
        if (query.backTimeStart) inboundArgs.push('--dep-hour-start', String(Number(query.backTimeStart.slice(0, 2))));
        if (query.backTimeEnd) inboundArgs.push('--dep-hour-end', String(Number(query.backTimeEnd.slice(0, 2))));
        const inboundData = await runFlyai(inboundArgs);
        const inboundOptions = uniqueFlights(normalize(inboundData).filter(f => inTime(f.time, query.backTimeStart || '', query.backTimeEnd || '') && reasonableItinerary(f)));
        const combinations = roundTripCombinations(fallbackOutboundOptions, inboundOptions, query);
        if (combinations.length) {
          results.push(...combinations);
          matchedDestinations.add(fallbackAirport.code);
        }
      } catch {
        continue;
      }
    }
  }
  return results.filter(Boolean).sort(domesticPriceSort).map((item, index) => ({ ...item, rank: index + 1 }));
}

export async function flywhereSearch(query: FlightQuery): Promise<any[]> {
  validateTripDates(query);
  const key = searchCacheKey(query);
  const cached = searchCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.results;
  const inflight = searchInflight.get(key);
  if (inflight) return inflight;
  const task = searchFresh(query).then(results => {
    searchCache.set(key, { results, expiresAt: Date.now() + 30 * 60 * 1000 });
    if (searchCache.size > 16) searchCache.delete(searchCache.keys().next().value as any);
    return results;
  });
  searchInflight.set(key, task);
  task.finally(() => searchInflight.delete(key)).catch(() => undefined);
  return task;
}

/* ---------------- AI 建议（复用 GoTrip 已配置的大模型） ---------------- */

function parseAiJson(content: string) {
  const clean = String(content || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未返回有效建议');
  return JSON.parse(clean.slice(start, end + 1));
}

export async function flywhereAiAdvice(payload: { results: any[] }): Promise<{ summary: string; advice: { id: string; label: string; reason: string }[] }> {
  const candidates = Array.isArray(payload.results) ? payload.results.slice(0, 12) : [];
  if (!candidates.length) throw new Error('没有可供 AI 分析的航班组合');
  const prompt = `你是机票决策助手。请分析以下真实航班候选，为用户给出可并列比较的建议。不要筛选、不要修改排序、不要创造或推测数据。请从候选中分别选择：优先考虑（平衡总价、总行程、直飞）、最省钱（总价最低）、少折腾（优先直飞和较短总行程；没有直飞时说明取舍）。仅返回 JSON：{"summary":"一句不超过50字的整体建议","advice":[{"label":"优先考虑","id":"候选id","reason":"不超过40字，具体说明价格、时长、直飞等取舍"},{"label":"最省钱","id":"候选id","reason":"不超过40字"},{"label":"少折腾","id":"候选id","reason":"不超过40字"}]}。每个 id 必须来自候选中的 id；候选不足三个时允许复用。不要把「已配对」当作理由。候选：${JSON.stringify(candidates.map(c => ({ id: c.id, city: c.city, date: c.date, backDate: c.backDate, airline: c.airline, out: c.out, back: c.back, direct: c.direct, duration: c.duration, fare: c.fare, fees: c.fees, perPerson: c.perPerson, totalPrice: c.totalPrice })))}。`;
  const raw = await chat('你是机票决策助手，只输出 JSON。', prompt, 60000);
  if (!raw) throw new Error('AI 未返回建议，请稍后重试');
  const parsed = parseAiJson(raw);
  const availableIds = new Set(candidates.map(item => item.id));
  const defaults = ['优先考虑', '最省钱', '少折腾'];
  const advice = (Array.isArray(parsed?.advice) ? parsed.advice : [])
    .filter((item: any) => item && availableIds.has(item.id))
    .slice(0, 3)
    .map((item: any, index: number) => ({
      id: item.id,
      label: String(item.label || defaults[index] || '建议').slice(0, 12),
      reason: String(item.reason || '').slice(0, 80),
    }));
  if (!advice.length) throw new Error('AI 未返回可用建议');
  return { summary: String(parsed?.summary || '').slice(0, 120), advice };
}
