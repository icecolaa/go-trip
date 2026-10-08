import type { WeatherDay } from '../../shared/types.ts';
import { locatePlace } from './poi.ts';

const AMAP_KEY = process.env.GOTRIP_AMAP_KEY || '';

const CODE_MAP: [number, string, string][] = [
  [0, '晴', '☀️'], [1, '多云转晴', '🌤️'], [2, '多云', '⛅'], [3, '阴', '☁️'],
  [45, '雾', '🌫️'], [48, '雾凇', '🌫️'], [51, '小毛雨', '🌦️'], [53, '毛雨', '🌦️'],
  [55, '大毛雨', '🌧️'], [61, '小雨', '🌦️'], [63, '中雨', '🌧️'], [65, '大雨', '🌧️'],
  [66, '冻雨', '🌧️'], [67, '强冻雨', '🌧️'], [71, '小雪', '🌨️'], [73, '中雪', '❄️'],
  [75, '大雪', '❄️'], [77, '雪粒', '🌨️'], [80, '阵雨', '🌦️'], [81, '强阵雨', '🌧️'],
  [82, '暴雨', '⛈️'], [85, '阵雪', '🌨️'], [86, '强阵雪', '❄️'], [95, '雷阵雨', '⛈️'],
  [96, '雷雨伴冰雹', '⛈️'], [99, '强雷雨伴冰雹', '⛈️'],
];

function codeInfo(code: number): { label: string; icon: string } {
  const hit = CODE_MAP.find(c => c[0] === code);
  return hit ? { label: hit[1], icon: hit[2] } : { label: '未知', icon: '🌡️' };
}

/** 高德天气文案 → emoji（降级链路文案源） */
function amapIcon(txt: string): string {
  if (!txt) return '🌡️';
  if (txt.indexOf('雷') >= 0) return '⛈️';
  if (txt.indexOf('冰雹') >= 0) return '⛈️';
  if (txt.indexOf('暴') >= 0 && txt.indexOf('雨') >= 0) return '🌧️';
  if (txt.indexOf('雨') >= 0) return '🌧️';
  if (txt.indexOf('雪') >= 0) return '❄️';
  if (txt.indexOf('雾') >= 0 || txt.indexOf('霾') >= 0) return '🌫️';
  if (txt.indexOf('阴') >= 0) return '☁️';
  if (txt.indexOf('多云') >= 0) return '⛅';
  if (txt.indexOf('晴') >= 0) return '☀️';
  return '🌤️';
}

function placeholder(place: string, dates: string[]): WeatherDay[] {
  return dates.map(date => ({
    date, place, weatherCode: -1, label: '暂无数据', icon: '—', tempMax: null, tempMin: null,
  }));
}

/* ---------- 日期工具（Asia/Shanghai 视角） ---------- */

function shToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function isoAdd(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function shiftYear(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* Open-Meteo forecast API 可服务窗口：today-92 ~ today+16（TREK 同款 16 天预报） */
const FORECAST_PAST = 92;
const FORECAST_FUTURE = 16;

/** place → { adcode, lat, lng }（高德 geocode 一次拿全；进程内缓存） */
const geoCache = new Map<string, { adcode: string; lat: number; lng: number }>();
async function geocodeOf(place: string): Promise<{ adcode: string; lat: number; lng: number }> {
  const hit = geoCache.get(place);
  if (hit) return hit;
  const out = { adcode: '', lat: NaN, lng: NaN };
  if (AMAP_KEY) {
    try {
      const url = new URL('https://restapi.amap.com/v3/geocode/geo');
      url.searchParams.set('key', AMAP_KEY);
      url.searchParams.set('address', place);
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data: any = await resp.json();
      const g = data?.status === '1' ? data.geocodes?.[0] : null;
      if (g) {
        out.adcode = g.adcode || '';
        const [lng, lat] = String(g.location || ',').split(',').map(Number);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) { out.lat = lat; out.lng = lng; }
      }
    } catch { /* 失败走内置城市表兜底 */ }
  }
  if (Number.isNaN(out.lat)) {
    const loc = locatePlace(place);
    if (loc) { out.lat = loc.lat; out.lng = loc.lng; }
  }
  if (out.adcode || !Number.isNaN(out.lat)) geoCache.set(place, out);
  return out;
}

function row(date: string, place: string, code: number, label: string, icon: string, max: any, min: any, est = false): WeatherDay {
  const l = est ? 'Ø ' + label : label; // Ø 前缀 = 历史气候估算，非实时预报（TREK 同款约定）
  return {
    date, place, weatherCode: est ? -3 : code,
    label: l, icon,
    tempMax: max == null || max === '' ? null : Math.round(Number(max)),
    tempMin: min == null || min === '' ? null : Math.round(Number(min)),
  };
}

/** Open-Meteo forecast：today-92 ~ today+16 真预报（行程全窗口一次请求） */
async function omForecast(place: string, dates: string[], lat: number, lng: number): Promise<Map<string, WeatherDay> | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('start_date', dates[0]);
    url.searchParams.set('end_date', dates[dates.length - 1]);
    url.searchParams.set('timezone', 'Asia/Shanghai');
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data: any = await resp.json();
    const daily = data?.daily;
    if (!daily?.time) return null;
    const out = new Map<string, WeatherDay>();
    daily.time.forEach((t: string, i: number) => {
      const code = Number(daily.weather_code[i]);
      const info = codeInfo(code);
      out.set(t, row(t, place, code, info.label, info.icon, daily.temperature_2m_max[i], daily.temperature_2m_min[i]));
    });
    return out;
  } catch { return null; }
}

/** Open-Meteo archive：去年同期历史气候 → 超 16 天的未来日期估算（est=true） */
async function omClimateEstimate(place: string, dates: string[], lat: number, lng: number): Promise<Map<string, WeatherDay> | null> {
  try {
    const shifted = dates.map(d => shiftYear(d, -1)).sort();
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('start_date', shifted[0]);
    url.searchParams.set('end_date', shifted[shifted.length - 1]);
    url.searchParams.set('timezone', 'Asia/Shanghai');
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data: any = await resp.json();
    const daily = data?.daily;
    if (!daily?.time) return null;
    const byShifted = new Map<string, any>();
    daily.time.forEach((t: string, i: number) => byShifted.set(t, i));
    const out = new Map<string, WeatherDay>();
    dates.forEach(d => {
      const i = byShifted.get(shiftYear(d, -1));
      if (i == null) return;
      const code = Number(daily.weather_code[i]);
      const info = codeInfo(code);
      out.set(d, row(d, place, code, info.label, info.icon, daily.temperature_2m_max[i], daily.temperature_2m_min[i], true));
    });
    return out;
  } catch { return null; }
}

/** 结果缓存（place|start|end → rows，TTL 1h）：重复进入总览不重复打外部 API */
const cache = new Map<string, { at: number; rows: WeatherDay[] }>();
const CACHE_TTL = 60 * 60 * 1000;

/**
 * 天气主链路（1.5.30 重构，参考 TREK）：
 * Open-Meteo 16 天真预报为主源（无 Key 稳定）；
 * 超 16 天的未来日期用「去年同期历史气候」估算（label 加 Ø 前缀标明非实时）；
 * Open-Meteo 不可用时降级高德（仅 today+3，窗口外占位）。
 */
export async function getWeather(place: string, dates: string[]): Promise<WeatherDay[]> {
  const results = placeholder(place, dates);
  if (!place || !dates.length) return results;
  const sorted = dates.slice().sort();
  const key = place + '|' + sorted[0] + '|' + sorted[sorted.length - 1] + '|' + dates.length;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.rows;

  const today = shToday();
  const limit = isoAdd(today, FORECAST_FUTURE);
  const past = isoAdd(today, -FORECAST_PAST);
  const win = sorted.filter(d => d >= past && d <= limit);
  const estDates = sorted.filter(d => d > limit);

  const merged = new Map<string, WeatherDay>();
  const geo = await geocodeOf(place);

  if (!Number.isNaN(geo.lat) && win.length) {
    const om = await omForecast(place, win, geo.lat, geo.lng);
    if (om) om.forEach((v, k) => merged.set(k, v));
  }
  if (!Number.isNaN(geo.lat) && estDates.length) {
    const est = await omClimateEstimate(place, estDates, geo.lat, geo.lng);
    if (est) est.forEach((v, k) => merged.set(k, v));
  }
  if (merged.size) {
    const rows = dates.map(d => merged.get(d) || {
      date: d, place, weatherCode: -1, label: '暂无数据', icon: '—', tempMax: null, tempMin: null,
    });
    cache.set(key, { at: Date.now(), rows });
    return rows;
  }

  /* Open-Meteo 整体不可用 → 降级高德（仅能覆盖 today+3，窗口外保持占位） */
  try {
    if (!geo.adcode && AMAP_KEY) {
      // geocode 失败但可能有 Key：单独补 adcode 再试
      const url = new URL('https://restapi.amap.com/v3/geocode/geo');
      url.searchParams.set('key', AMAP_KEY);
      url.searchParams.set('address', place);
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const dd: any = await r.json();
      geo.adcode = dd?.status === '1' ? (dd.geocodes?.[0]?.adcode || '') : '';
    }
    if (geo.adcode) {
      const url = new URL('https://restapi.amap.com/v3/weather/weatherInfo');
      url.searchParams.set('key', AMAP_KEY);
      url.searchParams.set('city', geo.adcode);
      url.searchParams.set('extensions', 'all');
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data: any = await resp.json();
      if (data?.status === '1' && Array.isArray(data?.forecasts?.[0]?.casts)) {
        const byDate = new Map<string, any>();
        data.forecasts[0].casts.forEach((c: any) => byDate.set(c.date, c));
        const rows = dates.map(date => {
          const c = byDate.get(date);
          if (!c) return { date, place, weatherCode: -1, label: '暂无数据', icon: '—', tempMax: null, tempMin: null };
          const label = c.dayweather || c.nightweather || '';
          return {
            date, place, weatherCode: -2, label: label || '暂无数据', icon: amapIcon(label),
            tempMax: c.daytemp != null && c.daytemp !== '' ? Math.round(Number(c.daytemp)) : null,
            tempMin: c.nighttemp != null && c.nighttemp !== '' ? Math.round(Number(c.nighttemp)) : null,
          };
        });
        cache.set(key, { at: Date.now(), rows });
        return rows;
      }
    }
  } catch { /* 降级失败 → 占位 */ }

  /* 失败不缓存占位：否则一次网络抖动会让 1h 内全部命中空数据（冒烟实测踩坑） */
  return results;
}
