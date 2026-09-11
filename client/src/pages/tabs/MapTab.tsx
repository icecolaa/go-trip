import { useMemo, useState } from 'react';
import { api, type Poi } from '../../api';
import { useApp } from '../../store';
import MapView, { type MapPoint, dayColor } from '../../components/MapView';
import { KIND_META, yuan } from '../../components/ui';
import type { TabCtx } from './tabCtx';

export default function MapTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [panelOpen, setPanelOpen] = useState(true);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Poi[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachAct, setAttachAct] = useState<Poi | null>(null);
  const [dayFilter, setDayFilter] = useState<number | null>(null);

  const points = useMemo<MapPoint[]>(() => {
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

  /** 打开高德：全部目的地按行程顺序串联（起点→途经→终点） */
  const searchAllDestinations = () => {
    if (!allLocated.length) { toast('还没有已定位的地点，编辑行程时搜索地点即可定位', true); return; }
    if (allLocated.length === 1) {
      const p = allLocated[0];
      window.open(`https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.title)}&src=gotrip&coordinate=gaode&callnative=0`, '_blank', 'noopener');
      return;
    }
    // 途经点过多时只取首尾与若干中间点，避免 URI 过长
    const fmt = (p: MapPoint) => `${p.lng},${p.lat},${p.title}`;
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
    const byDay = new Map<number, typeof bundle.activities>();
    for (const d of days) byDay.set(d.id, []);
    for (const a of bundle.activities) byDay.get(a.dayId)?.push(a);
    for (const list of byDay.values()) list.sort((x, y) => x.sort - y.sort || x.id - y.id);

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
        if (a.notes) parts.push(`— ${a.notes}`);
        lines.push(parts.join(' '));
      });
      lines.push('');
    }
    lines.push(`💰 预算 ${bundle.trip.budget || 0} 元 · 已花 ${bundle.budget.total} 元`);
    const text = lines.join(String.fromCharCode(10));
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制全部行程');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      toast('已复制全部行程');
    }
  };

  const search = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.get<Poi[]>(`/api/poi/search?q=${encodeURIComponent(q)}&city=${encodeURIComponent(bundle.trip.destination)}`);
      setResults(r);
    } finally {
      setBusy(false);
    }
  };

  const addToTrip = async (poi: Poi) => {
    // 添加到第一天（或最后一天）的行程里
    const day = bundle.days[0];
    if (!day) { toast('旅程还没有行程日', true); return; }
    try {
      await api.post(`/api/days/${day.id}/activities`, {
        title: poi.name, place: poi.name, kind: 'sight', lat: poi.lat, lng: poi.lng,
        notes: poi.desc || '', time: null,
      });
      toast(`已把「${poi.name}」加到第 ${day.dayNumber} 天，可在行程里调整`);
      reload();
    } catch (e: any) {
      toast(e.message, true);
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
      </div>
      <div className="muted" style={{ marginBottom: 10, marginTop: -4 }}>
        {points.length} 个已定位地点{hasNoGeo ? '（部分行程未定位，编辑行程时搜索地点即可定位）' : ''}
      </div>

      <div className="map-wrap">
        <MapView points={points} initialCenter={firstCenter(bundle)} initialZoom={10} />
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
              {results.length > 0 && <div className="muted" style={{ padding: '6px 8px' }}>点击结果添加到第一天行程</div>}
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

      {attachAct && (
        <div className="modal-mask" onClick={e => { if (e.target === e.currentTarget) setAttachAct(null); }}>
          <div className="modal" style={{ maxWidth: 380 }}>
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
                const dayId = Number((document.getElementById('map-poi-day') as HTMLSelectElement).value);
                try {
                  await api.post(`/api/days/${dayId}/activities`, {
                    title: attachAct.name, place: attachAct.name, kind: 'sight',
                    lat: attachAct.lat, lng: attachAct.lng, notes: attachAct.desc || '', time: null,
                  });
                  toast('已添加到行程');
                  setAttachAct(null);
                  reload();
                } catch (e: any) { toast(e.message, true); }
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
