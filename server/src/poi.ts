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
