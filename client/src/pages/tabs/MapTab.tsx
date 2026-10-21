import { useMemo, useState } from 'react';
import { useApp } from '../../store';
import MapView, { type MapPoint, dayColor } from '../../components/MapView';
import { KIND_META, yuan } from '../../components/ui';
import { maskSensitive } from '../../components/SensitiveText';
import { amapPlaceUrl } from '../../components/TripMode';
import { createActivity } from '../../rdb/ops';
import { proxy } from '../../rdb/proxy';
import type { TabCtx } from './tabCtx';
import type { Poi } from '../../types';

/** 代理返回的 POI 还带 kind/desc/source 等展示字段（新 Poi 类型只收坐标字段，这里补充声明） */
type PoiHit = Poi & { kind?: string; desc?: string; source?: 'amap' | 'builtin' };

/** 地图点（id 为数据模型 _id 字符串；MapView 组件尚未迁移仍按 number 建模，传参处收窄） */
type MapPt = { id: string; lat: number; lng: number; title: string; subtitle?: string; dayNumber?: number };

/** 地点分类（地图收录口径）：酒店/机场/车站/景点/餐厅/活动地点/集合点 */
const PLACE_GROUPS = [
  { key: 'hotel', label: '酒店', icon: '🏨' },
  { key: 'airport', label: '机场', icon: '✈️' },
  { key: 'station', label: '车站', icon: '🚉' },
  { key: 'attraction', label: '景点', icon: '🏞️' },
  { key: 'restaurant', label: '餐厅', icon: '🍜' },
  { key: 'activity', label: '活动地点', icon: '🎭' },
  { key: 'meeting', label: '集合点', icon: '📍' },
] as const;

function groupOfActivity(kind: string): string {
  if (kind === 'hotel') return 'hotel';
  if (kind === 'food') return 'restaurant';
  if (kind === 'sight') return 'attraction';
  return 'activity';
}

export default function MapTab({ bundle, reload, weather, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [panelOpen, setPanelOpen] = useState(true);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PoiHit[]>([]);
  const [queriedAt, setQueriedAt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [attachAct, setAttachAct] = useState<PoiHit | null>(null);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fallback'>('idle');
  const [copyText, setCopyText] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>(['attraction']);

  const points = useMemo<MapPt[]>(() => {
    const list = bundle.activities
      .filter(a => a.lat != null && a.lng != null)
      .map(a => ({
        id: a.id, lat: a.lat!, lng: a.lng!, title: a.title,
        subtitle: `第 ${bundle.days.find(d => d.id === a.dayId)?.dayNumber || '?'} 天 · ${a.time || '时间待定'}${a.cost ? ` · ${yuan(a.cost)}` : ''}`,
        dayNumber: bundle.days.find(d => d.id === a.dayId)?.dayNumber,
      }));
    return dayFilter == null ? list : list.filter(p => p.dayNumber === dayFilter);
  }, [bundle.activities, bundle.days, dayFilter]);

  const hasNoGeo = bundle.activities.some(a => a.lat == null && a.place);

  /** 按行程顺序（bundle.activities 已按天/排序返回）取全部已定位站点 */
  const allLocated = useMemo(
    () => bundle.activities.filter(a => a.lat != null && a.lng != null)
      .map(a => ({ id: a.id, lat: a.lat!, lng: a.lng!, title: a.place || a.title, subtitle: '', dayNumber: bundle.days.find(d => d.id === a.dayId)?.dayNumber })),
    [bundle.activities, bundle.days],
  );

  /** 收录地点按分类折叠：行程条目 + 候选/正式地点合并视图 */
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; sub: string; lat: number | null; lng: number | null; href?: string }[]>();
    for (const g of PLACE_GROUPS) m.set(g.key, []);
    for (const a of bundle.activities) {
      const g = groupOfActivity(a.kind);
      m.get(g)?.push({
        name: a.title,
        sub: [bundle.days.find(d => d.id === a.dayId) ? `D${bundle.days.find(d => d.id === a.dayId)!.dayNumber}` : '', a.time, a.place].filter(Boolean).join(' · '),
        lat: a.lat, lng: a.lng,
        href: (a.lat != null && a.lng != null) ? amapPlaceUrl(a.title, a.place, a.lat, a.lng, bundle.days.find(d => d.id === a.dayId)?.place || bundle.trip.destination || '') : undefined,
      });
    }
    for (const p of bundle.places || []) {
      if (!m.has(p.kind)) continue;
      m.get(p.kind)!.push({
        name: p.name,
        sub: [p.city, p.address].filter(Boolean).join(' · '),
        lat: p.lat, lng: p.lng,
        href: (p.lat != null && p.lng != null) ? amapPlaceUrl(p.name, p.address, p.lat, p.lng, p.city) : undefined,
      });
    }
    return m;
  }, [bundle.activities, bundle.days, bundle.places, bundle.trip.destination]);

  /** 打开高德：全部目的地按行程顺序串联（起点→途经→终点） */
  const searchAllDestinations = () => {
    if (!allLocated.length) { toast('还没有已定位的地点，编辑行程时搜索地点即可定位', true); return; }
    if (allLocated.length === 1) {
      const p = allLocated[0];
      window.open(`https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.title)}&src=gotrip&coordinate=gaode&callnative=0`, '_blank', 'noopener');
      return;
    }
    // 途经点过多时只取首尾与若干中间点，避免 URI 过长
    const fmt = (p: MapPt) => `${p.lng},${p.lat},${p.title}`;
    const first = allLocated[0], last = allLocated[allLocated.length - 1];
    const mid = allLocated.slice(1, -1);
    const via = (mid.length > 8 ? mid.filter((_, i) => i % Math.ceil(mid.length / 8) === 0).slice(0, 8) : mid).map(fmt).join(';');
    const url = `https://uri.amap.com/navigation?from=${encodeURIComponent(fmt(first))}&to=${encodeURIComponent(fmt(last))}` +
      (via ? `&via=${encodeURIComponent(via)}` : '') +
      `&mode=car&src=gotrip&coordinate=gaode&callnative=0`;
    window.open(url, '_blank', 'noopener');
  };

  /** 一键复制全部行程（逐天逐站，含时间/地点/费用） */
  const copyAllItinerary = async () => {
    const days = bundle.days;
    if (!days.length) { toast('还没有行程内容', true); return; }
    const byDay = new Map<string, typeof bundle.activities>();
    for (const d of days) byDay.set(d.id, []);
    for (const a of bundle.activities) byDay.get(a.dayId)?.push(a);
    for (const list of byDay.values()) list.sort((x, y) => x.sort - y.sort || x.id.localeCompare(y.id));

    const lines: string[] = [
      `【${bundle.trip.title}】${bundle.trip.destination || ''}`.trim(),
      `${bundle.trip.startDate} ~ ${bundle.trip.endDate}　共 ${days.length} 天 · ${bundle.activities.length} 项安排`,
      '',
    ];
    for (const d of days) {
      const acts = byDay.get(d.id) || [];
      lines.push(`D${d.dayNumber}（${d.date}${d.title ? ' · ' + d.title : ''}）${d.place ? '📍' + d.place : ''}`);
      if (!acts.length) lines.push('  （暂无安排）');
      acts.forEach((a, i) => {
        const parts = [`  ${i + 1}.`];
        if (a.time) parts.push(a.time);
        parts.push(a.title);
        if (a.place) parts.push(`（${a.place}）`);
        if (a.cost) parts.push(`¥${a.cost}`);
        if (a.notes) parts.push(`— ${maskSensitive(a.notes)}`);
        lines.push(parts.join(' '));
      });
      lines.push('');
    }
    lines.push(`💰 预算 ${bundle.trip.budget || 0} 元 · 已花 ${bundle.budget.total} 元`);
    const text = lines.join(String.fromCharCode(10));
    setCopyText(text);
    // 只有确认复制成功才提示「已复制」；浏览器不允许时展开文字让用户长按手动复制
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('ok');
      window.setTimeout(() => setCopyState(s => (s === 'ok' ? 'idle' : s)), 2600);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) { setCopyState('ok'); window.setTimeout(() => setCopyState(s => (s === 'ok' ? 'idle' : s)), 2600); return; }
      } catch { /* 继续走降级 */ }
      setCopyState('fallback');
    }
  };

  const search = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const r = await proxy.get<PoiHit[]>(`/api/poi/search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(bundle.trip.destination)}`);
      setResults(r);
      setQueriedAt(new Date().toISOString().slice(0, 10));
    } catch (e) {
      toast(e instanceof Error ? e.message : '搜索失败', true);
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const addToTrip = async (poi: PoiHit) => {
    // 添加到第一天（或最后一天）的行程里
    const day = bundle.days[0];
    if (!day) { toast('旅程还没有行程日', true); return; }
    try {
      await createActivity(bundle.trip.id, day.id, {
        title: poi.name, place: poi.name, kind: 'sight', lat: poi.lat, lng: poi.lng,
        notes: poi.desc || '', time: null,
      }, bundle.members[0]?.displayName || '我');
      toast(`已把「${poi.name}」加到第 ${day.dayNumber} 天，可在行程里调整`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', true);
    }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>旅行地图</h2>
        <div className="chips">
          <button className={'chip' + (dayFilter == null ? ' on' : '')} onClick={() => setDayFilter(null)}>全部</button>
          {bundle.days.map(d => (
            <button key={d.id} className={'chip' + (dayFilter === d.dayNumber ? ' on' : '')} onClick={() => setDayFilter(dayFilter === d.dayNumber ? null : d.dayNumber)}>
              D{d.dayNumber}
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={searchAllDestinations} title="在高德地图中查看全部目的地路线">🗺️ 高德搜索全部目的地</button>
        <button className="btn sm" onClick={copyAllItinerary} title="复制完整行程文本">📋 复制全部行程</button>
        {copyState === 'ok' && <span className="tag" style={{ color: 'var(--accent)' }}>已复制</span>}
      </div>

      {/* 复制降级：浏览器不允许复制时展开文字，供长按手动复制 */}
      {copyState === 'fallback' && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="row-ops" style={{ marginBottom: 6 }}>
            <b style={{ fontSize: 13, flex: 1 }}>当前浏览器不允许自动复制，请长按下面文字手动复制</b>
            <button className="btn sm ghost" onClick={() => setCopyState('idle')}>收起</button>
          </div>
          <textarea className="input" readOnly rows={8} value={copyText} style={{ width: '100%', fontSize: 12, userSelect: 'text' }} />
        </div>
      )}
      <div className="muted" style={{ marginBottom: 10, marginTop: -4 }}>
        {points.length} 个已定位地点{hasNoGeo ? '（部分行程未定位，编辑行程时搜索地点即可定位）' : ''}
        {weather.length ? ` · 天气来源 open-meteo，查询于 ${new Date().toISOString().slice(0, 10)}` : ''}
      </div>

      <div className="map-wrap">
        <MapView points={points as unknown as MapPoint[]} initialCenter={firstCenter(bundle)} initialZoom={10} />
        {canEdit && panelOpen && (
          <div className="map-poi-panel">
            <h4>🔍 地点搜索 <button className="btn sm ghost" style={{ float: 'right' }} onClick={() => setPanelOpen(false)}>收起</button></h4>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input className="input" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') search(); }} placeholder="搜索景点/餐厅/酒店" />
              <button className="btn sm" onClick={search} disabled={busy}>{busy ? '…' : '搜'}</button>
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {results.map((p, i) => (
                <div key={i} className="poi-item" onClick={() => setAttachAct(p)}>
                  <span className="k">{p.kind}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.name}</b>
                    <div className="muted" style={{ fontSize: 11.5 }}>{p.city}{p.desc ? ` · ${p.desc.slice(0, 16)}` : ''}</div>
                  </span>
                </div>
              ))}
              {results.length > 0 && (
                <div className="muted" style={{ padding: '6px 8px', fontSize: 11.5 }}>
                  来源：{results[0]?.source === 'amap' ? '高德地图' : '内置城市库'}
                  {queriedAt ? ` · 查询于 ${queriedAt}` : ''}
                  <br />点击结果添加到第一天行程
                </div>
              )}
            </div>
            {results.length === 0 && (
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                {bundle.trip.destination ? `正在「${bundle.trip.destination}」范围内搜索` : '输入关键词搜索地点'}
                <br />内置了全国主要城市的热门景点，配置高德 Key 后可搜索任意地点。
              </div>
            )}
          </div>
        )}
        {canEdit && !panelOpen && (
          <button className="btn sm" style={{ position: 'absolute', top: 12, right: 12, zIndex: 500 }} onClick={() => setPanelOpen(true)}>搜索地点</button>
        )}
        <div className="map-legend">
          {bundle.days.slice(0, 8).map(d => (
            <span key={d.id} className="lg-item">
              <span className="dot" style={{ background: dayColor(d.dayNumber) }} /> D{d.dayNumber}
            </span>
          ))}
          <span className="lg-item">🧭 虚线为建议路线顺序</span>
        </div>
      </div>

      {/* 收录地点：按分类折叠，无坐标的条目不落图但仍列出 */}
      <div style={{ marginTop: 14 }}>
        <h3 className="section-title" style={{ fontSize: 15 }}>收录地点</h3>
        {PLACE_GROUPS.map(g => {
          const list = grouped.get(g.key) || [];
          if (!list.length) return null;
          const open = openGroups.includes(g.key);
          return (
            <details className="place-group" key={g.key} open={open}
              onToggle={e => {
                // open 必须在 updater 外取：StrictMode 双调用 updater 时 e.currentTarget 已为 null（同 ItineraryTab 的修复）
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                setOpenGroups(prev => isOpen ? [...new Set([...prev, g.key])] : prev.filter(k => k !== g.key));
              }}>
              <summary>{g.icon} {g.label} <span className="cnt">{list.length}</span></summary>
              <div className="place-list">
                {list.map((p, i) => (
                  <div className="place-item map-place-card" key={`${p.name}-${i}`} data-place-name={p.name}>
                    <div className="nm">{p.name}</div>
                    {p.sub && <div className="sub">{p.sub}</div>}
                    {p.lat == null && <div className="sub">坐标待确认，暂不在地图上标点</div>}
                    {p.href && <div className="ops"><a className="btn sm ghost" href={p.href} target="_blank" rel="noreferrer">导航</a></div>}
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {attachAct && (
        <div className="modal-mask" onClick={e => { if (e.target === e.currentTarget) setAttachAct(null); }}>          <div className="modal" style={{ maxWidth: 380 }}>
            <h3>添加「{attachAct.name}」</h3>
            <p className="muted" style={{ marginTop: -8 }}>{attachAct.kind} · {attachAct.city}{attachAct.desc ? ` · ${attachAct.desc}` : ''}</p>
            <div className="field">
              <label>添加到哪一天</label>
              <select id="map-poi-day" className="input" defaultValue={bundle.days[0]?.id}>
                {bundle.days.map(d => <option key={d.id} value={d.id}>第 {d.dayNumber} 天 · {d.date}</option>)}
              </select>
            </div>
            <div className="modal-ops">
              <button className="btn" onClick={() => setAttachAct(null)}>取消</button>
              <button className="btn primary" onClick={async () => {
                const dayId = (document.getElementById('map-poi-day') as HTMLSelectElement).value;
                try {
                  await createActivity(bundle.trip.id, dayId, {
                    title: attachAct.name, place: attachAct.name, kind: 'sight',
                    lat: attachAct.lat, lng: attachAct.lng, notes: attachAct.desc || '', time: null,
                  }, bundle.members[0]?.displayName || '我');
                  toast('已添加到行程');
                  setAttachAct(null);
                  reload();
                } catch (e) { toast(e instanceof Error ? e.message : '添加失败', true); }
              }}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function firstCenter(bundle: TabCtx['bundle']): [number, number] | undefined {
  const withGeo = bundle.activities.find(a => a.lat != null && a.lng != null);
  if (withGeo) return [withGeo.lat!, withGeo.lng!];
  return undefined;
}
