import { useEffect, useMemo, useRef, useState } from 'react';
import { proxy } from '../rdb/proxy';
import { useApp } from '../store';
import type { Activity, TripBundle, TripDay, WeatherDay } from '@shared/types';
import { KIND_META, weekOf, fmtDate, yuan } from './ui';
import SensitiveText from '../components/SensitiveText';

/* ============ 出发模式：当天行程全屏视图（参考旅行手册 Trip Mode） ============ */

interface Props {
  bundle: TripBundle;
  weather: WeatherDay[];
  onClose: () => void;
}

interface Stop {
  act: Activity;
  dayNumber: number;
}

function doneKey(tripId: number) { return `gotrip_done_${tripId}`; }

function readDone(tripId: number): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(doneKey(tripId)) || '{}') || {}; } catch { return {}; }
}

/** 两点间球面距离（km） */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/** 高德地点页 / 导航链接 */
export function amapPlaceUrl(title: string, place: string | null, lat: number | null, lng: number | null, city: string): string {
  if (lat != null && lng != null) {
    return `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(title)}&src=gotrip&coordinate=gaode&callnative=0`;
  }
  const base = lastSegment(place || title || '');
  const q = base.length >= 4 || (city && base.includes(city)) ? base : `${city} ${base}`.trim();
  return `https://www.amap.com/search?query=${encodeURIComponent(q)}`;
}

/** 取「A → B → C」多段地名的末段（当前所在位置） */
function lastSegment(place: string): string {
  const segs = place.split(/\s*(?:→|->)\s*/).filter(Boolean);
  return segs.length > 1 ? segs[segs.length - 1] : place;
}

/** 站点标签：清洗标题的动词前后缀，得到具体地名（如「穿越科尔沁大草原」→「科尔沁大草原」） */
function stopLabel(a: Activity): string {
  const clean = a.title.trim()
    .replace(/^(穿越|游览|前往|去往|到达|抵达|入住|参观|返回|包车|骑行|徒步|漫步|打卡|品尝|集合|去|到|逛|游|吃)/, '')
    .replace(/(集合出发|附近客栈|附近|周边|一带|之旅)$/, '')
    .trim();
  const label = clean || a.place?.trim() || a.title.trim();
  return label.slice(0, 10);
}

/**
 * 从当日标题/地点提取最可能命中的搜索词。
 * AI 生成的行程日常是「A-B-C」多段主题（如「赤峰-科尔沁草原-阿尔山」），
 * 整串去搜索会被地名后缀干扰（命中「阿尔山路」），需拆词取当日主目的地。
 */
export function smartDayQuery(day: TripDay | undefined, destination: string): string {
  const place = day?.place?.trim();
  if (place && place !== destination) return place; // 当日地点明确（多城行程）直接用
  const title = (day?.title || '').trim();
  if (!title) return destination;
  // 按常见分隔符拆词
  const tokens = title.split(/[-—–·•→>/／,，、;；:：!?！？\s]+/).map(t => t.trim()).filter(t => t.length >= 2);
  // 去掉行程修饰词（一日游/抵达/返程…）
  const cleaned = tokens
    .map(t => t.replace(/(全天游|一日游|半日游|深度游|经典一日|自由活动|全天|一日|半日|返程|抵达|到达|出发|前往|返回|初见|初探|初体验|慢时光|休闲|印象|巡礼)/g, '').trim())
    .filter(t => t.length >= 2);
  // 行程标题通常按时间顺序排列，取最后一个具体地名（终点/主目的地）
  return cleaned[cleaned.length - 1] || tokens[tokens.length - 1] || destination;
}

/** 高德路线规划：起点 → 途经 → 终点（需至少两站有坐标） */
export function amapRouteUrl(stops: Activity[]): string | null {
  const pts = stops.filter(a => a.lat != null && a.lng != null);
  if (pts.length < 2) return null;
  const fmt = (a: Activity) => `${a.lng},${a.lat},${a.place || a.title}`;
  const first = pts[0], last = pts[pts.length - 1];
  const via = pts.slice(1, -1).map(fmt).join(';');
  return `https://uri.amap.com/navigation?from=${encodeURIComponent(fmt(first))}&to=${encodeURIComponent(fmt(last))}` +
    (via ? `&via=${encodeURIComponent(via)}` : '') +
    `&mode=car&policy=&src=gotrip&coordinate=gaode&callnative=0`;
}

/**
 * 小红书搜索词：内容搜索是「多词 AND」语义，目的地前缀会大幅收窄结果。
 * 含城市信息的独立地名（如「大庆站」「阿尔山火车站」）直接单独搜；
 * 过短或泛化地名（如「古城」「草原」）才拼目的地限定，避免跑题。
 */
function xhsQuery(a: Activity, city: string): string {
  let base = (a.place || a.title || '').trim();
  if (!base) return city;
  const segs = base.split(/\s*(?:→|->)\s*/).filter(Boolean);
  if (segs.length > 1) base = segs[segs.length - 1];
  if (base.length <= 2 || !base.includes(city)) return `${city} ${base}`;
  if (/(站|机场)$/.test(base) || base.length >= 4) return base;
  return `${city} ${base}`;
}

function xhsUrl(q: string): string {
  return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(q)}`;
}

/** 手绘风格 SVG 路线概览（断网也能看方位） */
function HandMap({ stops }: { stops: Activity[] }) {
  const pts = useMemo(() => {
    const geo = stops.filter(s => s.lat != null && s.lng != null);
    if (geo.length === stops.length && stops.length > 1) {
      const la = stops.map(s => s.lat!), lo = stops.map(s => s.lng!);
      const minLa = Math.min(...la), maxLa = Math.max(...la);
      const minLo = Math.min(...lo), maxLo = Math.max(...lo);
      // 坐标几乎重合（同城共用代表点）时真实投影无意义，改用错落布局
      if (maxLa - minLa >= 0.02 || maxLo - minLo >= 0.02) {
        const ySpan = Math.max(maxLa - minLa, 0.001), xSpan = Math.max(maxLo - minLo, 0.001);
        return stops.map(s => ({
          x: 90 + (s.lng! - minLo) / xSpan * 760,
          y: 470 - (s.lat! - minLa) / ySpan * 350,
        }));
      }
    }
    const n = Math.max(stops.length, 1);
    return stops.map((_, i) => {
      const r = n === 1 ? 0.5 : i / (n - 1);
      return { x: 90 + r * 760, y: 200 + r * 160 + Math.sin(r * Math.PI * 2) * 55 };
    });
  }, [stops]);

  const line = pts.map(p => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ');
  return (
    <svg className="tm-hand-map" viewBox="0 0 940 560" role="img" aria-label="当日手绘路线概览">
      <rect width="940" height="560" rx="26" className="tm-map-paper" />
      <path d="M40 130 C210 75 365 125 520 100 S765 70 900 130 M25 320 C180 270 355 335 500 305 S760 270 920 330 M85 500 C235 445 395 500 555 470 S760 445 885 490 M140 35 C115 180 165 350 120 525 M455 30 C430 180 490 350 460 530 M790 35 C760 210 825 360 785 525" className="tm-map-grid" />
      <polyline points={line} className="tm-map-line" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={25} className={'tm-map-dot' + (i === pts.length - 1 ? ' is-last' : '')} />
          <text x={p.x} y={p.y + 8} className="tm-map-number">{i + 1}</text>
          <text x={p.x} y={p.y + (i % 2 === 0 ? -48 : 58)} className="tm-map-label">{stopLabel(stops[i])}</text>
        </g>
      ))}
      <text x="42" y="52" className="tm-map-caption">方位示意 · 非精确导航</text>
      <text x="858" y="52" className="tm-map-north">北 ↑</text>
    </svg>
  );
}

export default function TripMode({ bundle, weather, onClose }: Props) {
  const { toast } = useApp();
  const saved = useMemo(() => {
    try { return Number(sessionStorage.getItem(`gotrip_tm_day_${bundle.trip.id}`) || 0); } catch { return 0; }
  }, [bundle.trip.id]);
  const [dayIdx, setDayIdx] = useState(Math.min(saved, Math.max(bundle.days.length - 1, 0)));
  const [done, setDone] = useState<Record<string, boolean>>(() => readDone(bundle.trip.id));
  const [geocoding, setGeocoding] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);

  const days = bundle.days;
  const day = days[dayIdx];
  const acts = useMemo(() => (
    bundle.activities.filter(a => a.dayId === day?.id).sort((x, y) => x.sort - y.sort || x.id - y.id)
  ), [bundle.activities, day]);

  const weatherByDate = useMemo(() => new Map(weather.map(w => [w.date, w])), [weather]);
  const w = day && weatherByDate.get(day.date);
  // 当日所在城市：多段目的地（如「大理 → 丽江」）按行程顺序取当日段
  const dayCity = useMemo(() => {
    const raw = day?.place || bundle.trip.destination || '';
    const segs = raw.split(/\s*(?:→|->)\s*/).filter(Boolean);
    return segs.length > 1 ? (segs[Math.min(dayIdx, segs.length - 1)] || raw) : raw;
  }, [day, bundle.trip.destination, dayIdx]);

  useEffect(() => {
    try { sessionStorage.setItem(`gotrip_tm_day_${bundle.trip.id}`, String(dayIdx)); } catch { /* ignore */ }
    chipsRef.current?.children[dayIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [dayIdx, bundle.trip.id]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggleDone = (id: number) => {
    setDone(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(doneKey(bundle.trip.id), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const doneCount = acts.filter(a => done[a.id]).length;
  const nextIdx = acts.findIndex(a => !done[a.id]);

  /** 「高德地图搜索今日目的地」：先用高德 POI 接口精确地理编码，失败再退关键词搜索 */
  const openDayOnAmap = async () => {
    if (geocoding) return;
    setGeocoding(true);
    const q = smartDayQuery(day, bundle.trip.destination || bundle.trip.title);
    const candidates = [...new Set([q, day?.place?.trim(), bundle.trip.destination].filter(x => x && x.length >= 2))] as string[];
    let opened = false;
    try {
      // 依次尝试候选词，命中第一个带坐标的 POI 就打开精确标记
      for (const cand of candidates) {
        try {
          const pois = await proxy.get<{ lat: number; lng: number; name: string }[]>(`/api/poi/search?q=${encodeURIComponent(cand)}`);
          const hit = pois.find(p => isFinite(p.lat) && isFinite(p.lng));
          if (hit) {
            window.open(`https://uri.amap.com/marker?position=${hit.lng},${hit.lat}&name=${encodeURIComponent(hit.name)}&src=gotrip&coordinate=gaode&callnative=0`, '_blank', 'noopener');
            opened = true;
            break;
          }
        } catch { /* 单个候选失败继续下一个 */ }
      }
    } finally {
      setGeocoding(false);
    }
    if (!opened) {
      // POI 接口无结果（未配 Key 且内置库未收录）→ 高德网页关键词搜索
      window.open(`https://www.amap.com/search?query=${encodeURIComponent(q)}`, '_blank', 'noopener');
    }
  };

  const copyDay = async () => {
    const lines = [
      `${fmtDate(day?.date || '')} · ${day?.title || day?.place || ''}`,
      ...acts.map((a, i) => `${i + 1}. ${a.time || '时间待定'} ${a.title}${a.place ? `（${a.place}）` : ''}${a.cost ? ` ¥${a.cost}` : ''}`),
    ];
    const text = lines.filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('今日路线已复制');
    } catch {
      // 剪贴板不可用时降级
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('今日路线已复制');
    }
  };

  const routeUrl = amapRouteUrl(acts);

  return (
    <div className="tm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="tm-panel">
        <header className="tm-header">
          <div className="tm-topline">
            <div>
              <small>TRIP MODE · {bundle.trip.destination || bundle.trip.title}</small>
              <strong>今天去哪里？</strong>
            </div>
            <button className="tm-close" onClick={onClose} aria-label="关闭">×</button>
          </div>
          <div className="tm-days-wrap">
            <button className="tm-arrow" onClick={() => chipsRef.current?.scrollBy({ left: -220, behavior: 'smooth' })} aria-label="前一天">‹</button>
            <nav className="tm-days" ref={chipsRef}>
              {days.map((d, i) => (
                <button key={d.id} className={'tm-day' + (i === dayIdx ? ' is-active' : '')} onClick={() => setDayIdx(i)}>
                  <b>D{String(d.dayNumber).padStart(2, '0')} · {d.date.slice(5).replace('-', '.')}</b>
                  <span>{d.title || d.place}</span>
                </button>
              ))}
            </nav>
            <button className="tm-arrow" onClick={() => chipsRef.current?.scrollBy({ left: 220, behavior: 'smooth' })} aria-label="后一天">›</button>
          </div>
        </header>

        <div className="tm-content">
          {day && (
            <>
              <section className="tm-intro">
                <small>{fmtDate(day.date)} {weekOf(day.date)}{w && w.tempMax != null ? ` · ${w.icon} ${w.label} ${w.tempMax}°/${w.tempMin}°` : ''}</small>
                <h2>{day.title || `${day.place || '今日'} 的一天`}</h2>
                <p>{day.place ? `今日主要在「${day.place}」` : '今日地点待定'}{acts.length ? ` · 共 ${acts.length} 站` : ''}{acts.length ? ` · 已完成 ${doneCount} 站` : ''}</p>
              </section>

              {acts.length === 0 && <div className="tm-empty">这一天还没有安排，睡到自然醒也很幸福 🛌</div>}

              {acts.length > 1 && (
                <details className="tm-map-block" open>
                  <summary><span><small>TODAY'S ROUTE</small><b>今日路线 · 手绘概览</b><em>断网也能看方位，精确导航用高德</em></span><i>＋</i></summary>
                  <div className="tm-map-body">
                    <HandMap stops={acts} />
                    <div className="tm-route-strip">
                      {acts.map((a, i) => (
                        <span key={a.id}>
                          <span className="tm-strip-no" style={{ background: 'var(--green)' }}>{i + 1}</span> {a.title}
                          {i < acts.length - 1 && <i>→</i>}
                        </span>
                      ))}
                    </div>
                    {routeUrl
                      ? <a className="tm-full-route" href={routeUrl} target="_blank" rel="noreferrer">🗺️ 用高德地图打开今日路线 ↗</a>
                      : <span className="muted">为行程点位标注坐标后，可一键用高德规划全天路线</span>}
                  </div>
                </details>
              )}

              {acts.length > 0 && (
                <>
                  <div className="tm-sec-head"><h3>今天的路线</h3><span>完成一站勾一站，「下一站」会自动高亮</span></div>
                  <div className="tm-stop-list">
                    {acts.map((a, i) => {
                      const isDone = !!done[a.id];
                      const isNext = i === nextIdx;
                      const next = acts[i + 1];
                      const dist = a.lat != null && a.lng != null && next?.lat != null && next?.lng != null
                        ? haversine(a.lat, a.lng, next.lat, next.lng) : null;
                      const km = amapPlaceUrl(a.title, a.place, a.lat, a.lng, dayCity);
                      return (
                        <div key={a.id}>
                          <article className={'tm-stop' + (isDone ? ' is-done' : '') + (isNext ? ' is-next' : '')}>
                            <label className="tm-check" title={isDone ? '标记为未完成' : '标记为完成'}>
                              <input type="checkbox" checked={isDone} onChange={() => toggleDone(a.id)} />
                            </label>
                            <span className="tm-stop-no">{String(i + 1).padStart(2, '0')}</span>
                            <div className="tm-stop-copy">
                              <time>{a.time || '时间待定'}{a.place ? ` · ${a.place}` : ''}</time>
                              <strong>{a.title}{isNext && <em className="tm-next-tag">下一站</em>}</strong>
                              {a.notes && <p><SensitiveText text={a.notes} /></p>}
                              <div className="tm-stop-meta">
                                <span className={'act-icon kind-' + a.kind} title={KIND_META[a.kind]?.label || a.kind}>{KIND_META[a.kind]?.icon || '📌'}</span>
                                {a.cost > 0 && <span className="tm-cost">{yuan(a.cost)}</span>}
                              </div>
                            </div>
                            <div className="tm-stop-actions">
                              <a className="tm-act-link" href={km} target="_blank" rel="noreferrer">高德导航</a>
                              <a className="tm-act-link is-xhs" href={xhsUrl(xhsQuery(a, dayCity))} target="_blank" rel="noreferrer">小红书</a>
                            </div>
                          </article>
                          {dist != null && dist > 0 && i < acts.length - 1 && (
                            <div className="tm-transfer">↓ 到下一站直线距离约 <b>{dist} km</b></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <nav className="tm-dock">
                <button className="btn" onClick={copyDay} disabled={!acts.length}>📋 复制今日路线</button>
                {routeUrl
                  ? <a className="btn primary" href={routeUrl} target="_blank" rel="noreferrer">🗺️ 高德导航全天路线 ↗</a>
                  : <button className="btn primary" onClick={openDayOnAmap} disabled={geocoding}>🗺️ {geocoding ? '正在定位今日目的地…' : '高德地图搜索今日目的地'} ↗</button>}
              </nav>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
