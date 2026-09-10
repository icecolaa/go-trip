import { searchBuiltinPois, findCity } from './cities.ts';
import type { Poi } from '../../shared/types.ts';

const AMAP_KEY = process.env.GOTRIP_AMAP_KEY || '';

interface AmapPoiResp {
  status: string;
  pois?: { name: string; address?: string; location?: string; type?: string; cityname?: string }[];
}

/** POI 搜索：优先高德（需配置 Key），失败或未配置时回退内置数据集 */
export async function searchPois(query: string, city: string): Promise<Poi[]> {
  const q = (query || '').trim();
  if (!q) return [];
  if (AMAP_KEY) {
    try {
      const url = new URL('https://restapi.amap.com/v3/place/text');
      url.searchParams.set('key', AMAP_KEY);
      url.searchParams.set('keywords', q);
      if (city) url.searchParams.set('city', city);
      url.searchParams.set('citylimit', 'false');
      url.searchParams.set('offset', '15');
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = (await resp.json()) as AmapPoiResp;
      if (data.status === '1' && data.pois?.length) {
        return data.pois
          .filter(p => p.location)
          .map(p => {
            const [lng, lat] = p.location!.split(',').map(Number);
            return {
              name: p.name,
              city: p.cityname || city || '',
              lat,
              lng,
              kind: (p.type || '').split(';')[0] || '地点',
              desc: p.address || '',
              source: 'amap' as const,
            };
          });
      }
    } catch {
      // 网络失败时静默回退到内置数据
    }
  }
  return searchBuiltinPois(q, city).map(p => ({
    name: p.name,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    kind: p.kind,
    desc: p.desc,
    source: 'builtin' as const,
  }));
}

/** 依据目的地名称猜测坐标（用于新行程地图初始位置与天气） */
export function locatePlace(place: string): { lat: number; lng: number } | null {
  const c = findCity(place);
  if (c) return { lat: c.lat, lng: c.lng };
  return null;
}

/** AI 应用行程的待定位条目 */
export interface GeocodeItem {
  id: number;      // 活动 id
  query: string;   // 地点名（place 优先，否则 title）
  city: string;    // 当日所在城市，用于约束搜索范围
}

/**
 * 批量为活动解析坐标：优先高德 POI（按当日城市约束），未命中回退内置城市库。
 * 相同查询共享结果；限制总查询数与总耗时，失败/超时只影响定位精度，不阻塞行程写入。
 */
export async function geocodePlaces(items: GeocodeItem[], maxLookups = 24, maxMs = 9000): Promise<Map<number, { lat: number; lng: number }>> {
  const result = new Map<number, { lat: number; lng: number }>();
  const cache = new Map<string, { lat: number; lng: number } | null>();
  const start = Date.now();
  let lookups = 0;
  for (const it of items) {
    if (result.has(it.id)) continue;
    const query = it.query.trim().slice(0, 40);
    if (!query) continue;
    const key = `${it.city}|${query}`;
    if (!cache.has(key)) {
      if (lookups >= maxLookups || Date.now() - start > maxMs) {
        cache.set(key, null); // 超出预算：本条不定位，其余复用缓存
        continue;
      }
      lookups++;
      let hit: { lat: number; lng: number } | null = null;
      try {
        const pois = await searchPois(query, it.city);
        hit = pois.find(p => isFinite(p.lat) && isFinite(p.lng)) || null;
      } catch { hit = null; }
      if (!hit) hit = locatePlace(query); // 内置城市库兜底（如「丽江」「杭州」）
      cache.set(key, hit);
    }
    const c = cache.get(key);
    if (c) result.set(it.id, c);
  }
  return result;
}

/** 生成高德 App 导航链接与网页链接 */
export function amapLinks(name: string, lat?: number | null, lng?: number | null): { uri: string; web: string } {
  if (lat != null && lng != null) {
    return {
      uri: `androidamap://viewMap?sourceApplication=gotrip&poiname=${encodeURIComponent(name)}&lat=${lat}&lon=${lng}&dev=0`,
      web: `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(name)}&src=gotrip`,
    };
  }
  return {
    uri: `androidamap://keywordSearch?sourceApplication=gotrip&keyword=${encodeURIComponent(name)}`,
    web: `https://www.amap.com/search?query=${encodeURIComponent(name)}`,
  };
}
