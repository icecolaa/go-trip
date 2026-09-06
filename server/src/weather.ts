import type { WeatherDay } from '../../shared/types.ts';
import { locatePlace } from './poi.ts';

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

/** 使用 Open-Meteo 获取逐日天气（免费无 Key）。国内访问不稳时自动超时降级 */
export async function getWeather(place: string, dates: string[]): Promise<WeatherDay[]> {
  const loc = locatePlace(place);
  const results: WeatherDay[] = dates.map(date => ({
    date, place, weatherCode: -1, label: '暂无数据', icon: '—', tempMax: null, tempMin: null,
  }));
  if (!loc || !dates.length) return results;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(loc.lat));
    url.searchParams.set('longitude', String(loc.lng));
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('start_date', dates[0]);
    url.searchParams.set('end_date', dates[dates.length - 1]);
    url.searchParams.set('timezone', 'Asia/Shanghai');
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data: any = await resp.json();
    const daily = data?.daily;
    if (!daily?.time) return results;
    const byDate = new Map<string, any>();
    daily.time.forEach((t: string, i: number) => byDate.set(t, i));
    dates.forEach((date, i) => {
      const idx = byDate.get(date);
      if (idx == null) return;
      const code = Number(daily.weather_code[idx]);
      const info = codeInfo(code);
      results[i] = {
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
    // 保留占位
  }
  return results;
}
