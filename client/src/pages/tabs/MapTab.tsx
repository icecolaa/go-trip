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
        <span className="muted">{points.length} 个已定位地点{hasNoGeo ? '（部分行程未定位，编辑行程时搜索地点即可定位）' : ''}</span>
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
          <button className="btn sm" style={{ position: 'absolute', top: 12, right: 12, zIndex: 500 }} onClick={() => setPanelOpen(true)}>🔍 搜索地点</button>
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
