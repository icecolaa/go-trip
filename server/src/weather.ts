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

/** 高德天气文案 → emoji（主链路文案源） */
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

/** place → adcode（高德 geocode，任意全国地名；进程内缓存） */
const adcodeCache = new Map<string, string>();
async function adcodeOf(place: string): Promise<string> {
  const hit = adcodeCache.get(place);
  if (hit) return hit;
  if (!AMAP_KEY) return '';
  const url = new URL('https://restapi.amap.com/v3/geocode/geo');
  url.searchParams.set('key', AMAP_KEY);
  url.searchParams.set('address', place);
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const data: any = await resp.json();
  const ad = data?.status === '1' ? (data.geocodes?.[0]?.adcode || '') : '';
  if (ad) adcodeCache.set(place, ad);
  return ad;
}

/** 高德天气预报（extensions=all：今天+3 天；窗口外日期保持占位） */
async function amapWeather(place: string, dates: string[], adcode: string): Promise<WeatherDay[] | null> {
  if (!adcode) return null;
  const url = new URL('https://restapi.amap.com/v3/weather/weatherInfo');
  url.searchParams.set('key', AMAP_KEY);
  url.searchParams.set('city', adcode);
  url.searchParams.set('extensions', 'all');
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const data: any = await resp.json();
  if (data?.status !== '1' || !Array.isArray(data?.forecasts?.[0]?.casts)) return null;
  const byDate = new Map<string, any>();
  data.forecasts[0].casts.forEach((c: any) => byDate.set(c.date, c));
  const results: WeatherDay[] = dates.map(date => {
    const c = byDate.get(date);
    if (!c) return { date, place, weatherCode: -1, label: '暂无数据', icon: '—', tempMax: null, tempMin: null };
    const label = c.dayweather || c.nightweather || '';
    return {
      date,
      place,
      weatherCode: -2, // 高德源标识（占位为 -1）
      label: label || '暂无数据',
      icon: amapIcon(label),
      tempMax: c.daytemp != null && c.daytemp !== '' ? Math.round(Number(c.daytemp)) : null,
      tempMin: c.nighttemp != null && c.nighttemp !== '' ? Math.round(Number(c.nighttemp)) : null,
    };
  });
  return results;
}

/** Open-Meteo 逐日天气（免费无 Key；高德不可用时的降级。国内访问不稳，超时即占位） */
async function openMeteoWeather(place: string, dates: string[], lat: number, lng: number): Promise<WeatherDay[] | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('start_date', dates[0]);
    url.searchParams.set('end_date', dates[dates.length - 1]);
    url.searchParams.set('timezone', 'Asia/Shanghai');
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data: any = await resp.json();
    const daily = data?.daily;
    if (!daily?.time) return null;
    const byDate = new Map<string, any>();
    daily.time.forEach((t: string, i: number) => byDate.set(t, i));
    return dates.map((date, i) => {
      const idx = byDate.get(date);
      if (idx == null) return { date, place, weatherCode: -1, label: '暂无数据', icon: '—', tempMax: null, tempMin: null };
      const code = Number(daily.weather_code[idx]);
      const info = codeInfo(code);
      return {
        date,
        place,
        weatherCode: code,
        label: info.label,
        icon: info.icon,
        tempMax: Math.round(Number(daily.temperature_2m_max[idx])),
        tempMin: Math.round(Number(daily.temperature_2m_min[idx])),
      };
    });
  } catch {
    return null;
  }
}

/** 天气：高德 geocode→weatherInfo 主链路（任意地名，不依赖内置城市表）；降级 Open-Meteo；全败占位 */
export async function getWeather(place: string, dates: string[]): Promise<WeatherDay[]> {
  const results = placeholder(place, dates);
  if (!place || !dates.length) return results;
  try {
    const adcode = await adcodeOf(place);
    const amap = await amapWeather(place, dates, adcode);
    if (amap) return amap;
  } catch { /* 高德失败 → 降级 */ }
  try {
    const loc = locatePlace(place);
    if (loc) {
      const om = await openMeteoWeather(place, dates, loc.lat, loc.lng);
      if (om) return om;
    }
  } catch { /* Open-Meteo 失败 → 占位 */ }
  return results;
}
