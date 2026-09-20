import { useMemo, useState } from 'react';
import type { TabCtx } from './tabCtx';
import { Modal } from '../../components/ui';
import StatusPicker, { StatusBadge } from '../../components/StatusPicker';
import SensitiveText from '../../components/SensitiveText';
import { amapPlaceUrl } from '../../components/TripMode';
import { api } from '../../api';
import type { TripPlace, TripPlaceKind } from '@shared/types';

/**
 * 景点餐厅：候选景点与可选餐厅各自折叠、默认收起、互不混排。
 * 候选条目只存在于 trip_places，绝不写入 days/activities（不擅自改变正式行程）。
 * 点击名称 → 跳到地图板块对应卡片并短暂高亮。
 */

const KIND_LABEL: Record<TripPlaceKind, string> = {
  attraction: '景点', restaurant: '餐厅', hotel: '住宿', transport: '交通',
  station: '车站', airport: '机场', meeting: '集合点', other: '其他',
};

const NEW_KINDS: TripPlaceKind[] = ['attraction', 'restaurant', 'meeting', 'station', 'airport', 'other'];

export default function PlacesTab({ bundle, canEdit, reload }: TabCtx) {
  const places = bundle.places || [];
  const [adding, setAdding] = useState(false);
  const [flashName, setFlashName] = useState<string | null>(null);

  const attractions = useMemo(() => places.filter(p => p.kind === 'attraction'), [places]);
  const restaurants = useMemo(() => places.filter(p => p.kind === 'restaurant'), [places]);
  const others = useMemo(() => places.filter(p => p.kind !== 'attraction' && p.kind !== 'restaurant'), [places]);

  /** 按城市分组（保持出现顺序） */
  function groupByCity(list: TripPlace[]): [string, TripPlace[]][] {
    const m = new Map<string, TripPlace[]>();
    for (const p of list) {
      const city = p.city || '未分城市';
      m.set(city, [...(m.get(city) || []), p]);
    }
    return [...m.entries()];
  }

  /** 跳到地图板块并高亮对应卡片 */
  function jumpToMap(name: string) {
    setFlashName(name);
    // 地图板块按名字匹配卡片；先切板块，再等渲染完成滚动+高亮
    location.hash = '';
    const url = new URL(location.href);
    url.searchParams.set('tab', 'map');
    url.hash = '';
    history.pushState(null, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-place-name="${CSS.escape(name)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
        window.setTimeout(() => el.classList.remove('flash'), 1700);
      }
    });
    window.setTimeout(() => setFlashName(null), 1800);
  }

  return (
    <div>
      <div className="row1" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          候选与可选地点不会自动加入正式行程，需要时再从「行程」里手动添加。
        </span>
        {canEdit && <button className="btn sm" onClick={() => setAdding(true)}>+ 添加地点</button>}
      </div>

      <details className="place-group" open={attractions.length <= 6}>
        <summary>🏞️ 候选景点 <span className="cnt">{attractions.length}</span></summary>
        <div className="place-list">
          {attractions.length === 0 && <div className="card empty">还没有候选景点</div>}
          {attractions.map(p => (
            <PlaceCard key={p.id} place={p} canEdit={canEdit} onJump={() => jumpToMap(p.name)} onSaved={reload} />
          ))}
        </div>
      </details>

      <details className="place-group">
        <summary>🍜 可选餐厅 <span className="cnt">{restaurants.length}</span></summary>
        <div className="place-list">
          {restaurants.length === 0 && <div className="card empty">还没有可选餐厅</div>}
          {groupByCity(restaurants).map(([city, list]) => (
            <div key={city} className="place-city">
              <div className="place-city-name">{city}</div>
              {list.map(p => (
                <PlaceCard key={p.id} place={p} canEdit={canEdit} onJump={() => jumpToMap(p.name)} onSaved={reload} />
              ))}
            </div>
          ))}
        </div>
      </details>

      {others.length > 0 && (
        <details className="place-group">
          <summary>📍 其他地点 <span className="cnt">{others.length}</span></summary>
          <div className="place-list">
            {others.map(p => (
              <PlaceCard key={p.id} place={p} canEdit={canEdit} onJump={() => jumpToMap(p.name)} onSaved={reload} />
            ))}
          </div>
        </details>
      )}

      {adding && (
        <AddPlaceModal
          tripId={bundle.trip.id}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await reload(); }}
        />
      )}
      {flashName && <span className="sr-only" aria-live="polite">已在地图中定位 {flashName}</span>}
    </div>
  );
}

function PlaceCard({ place, canEdit, onJump, onSaved }: {
  place: TripPlace; canEdit: boolean; onJump: () => void; onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(place.status);
  const [note, setNote] = useState(place.note);
  const [dishes, setDishes] = useState(place.dishes);

  async function save() {
    try {
      await api.patch(`/api/places/${place.id}`, { status, note, dishes });
      setEditing(false);
      await onSaved();
    } catch (e: any) { alert(e.message || '保存失败'); }
  }

  return (
    <div className="place-item" data-place-name={place.name}>
      <div className="row1">
        <button type="button" className="place-jump nm" onClick={onJump} title="在地图中定位">
          {place.name}
        </button>
        <StatusBadge status={place.status} />
      </div>
      <div className="sub">
        {[place.city, place.address].filter(Boolean).join(' · ') || '地址待补充'}
        {place.kind !== 'attraction' && place.kind !== 'restaurant' ? ` · ${KIND_LABEL[place.kind]}` : ''}
      </div>
      {place.dishes && <div className="note">推荐菜：{place.dishes}</div>}
      {place.note && <div className="note"><SensitiveText text={place.note} /></div>}
      <div className="ops">
        {(place.lat != null && place.lng != null) && (
          <a className="btn sm ghost" href={amapPlaceUrl(place.name, place.address, place.lat, place.lng, place.city)} target="_blank" rel="noreferrer">导航</a>
        )}
        {canEdit && <button className="btn sm ghost" onClick={() => setEditing(true)}>编辑</button>}
      </div>

      {editing && (
        <Modal title={place.name} onClose={() => setEditing(false)} width={480}>
          <label className="field">
            <span>备注</span>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} />
          </label>
          {place.kind === 'restaurant' && (
            <label className="field">
              <span>推荐菜（顿号分隔）</span>
              <input value={dishes} onChange={e => setDishes(e.target.value)} />
            </label>
          )}
          <div className="field">
            <span>确认状态</span>
            <StatusPicker value={status as any} canEdit onChange={v => setStatus(v as any)} />
          </div>
          <div className="modal-ops">
            <button className="btn ghost" onClick={() => setEditing(false)}>取消</button>
            <button className="btn" onClick={save}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddPlaceModal({ tripId, onClose, onSaved }: { tripId: number; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [kind, setKind] = useState<TripPlaceKind>('attraction');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [dishes, setDishes] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<any>('待确认');
  const [candidate, setCandidate] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { alert('请填写地点名称'); return; }
    setBusy(true);
    try {
      await api.post(`/api/trips/${tripId}/places`, { kind, name, city, address, dishes, note, status, candidate });
      await onSaved();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="添加地点" onClose={onClose} width={480}>
      <div className="field">
        <span>类型</span>
        <div className="chips">
          {NEW_KINDS.map(k => (
            <button key={k} type="button" className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="field"><span>名称</span><input value={name} onChange={e => setName(e.target.value)} placeholder="如：洱海生态廊道" /></label>
      <div className="row1">
        <label className="field" style={{ flex: 1 }}><span>城市</span><input value={city} onChange={e => setCity(e.target.value)} /></label>
        <label className="field" style={{ flex: 2 }}><span>地址</span><input value={address} onChange={e => setAddress(e.target.value)} /></label>
      </div>
      {kind === 'restaurant' && (
        <label className="field"><span>推荐菜（顿号分隔）</span><input value={dishes} onChange={e => setDishes(e.target.value)} /></label>
      )}
      <label className="field"><span>备注</span><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="field">
        <span>确认状态</span>
        <StatusPicker value={status} canEdit onChange={v => setStatus(v)} />
      </div>
      <label className="row1" style={{ gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={candidate} onChange={e => setCandidate(e.target.checked)} style={{ width: 16, height: 16 }} />
        <span>作为候选/可选（不加入正式行程）</span>
      </label>
      <div className="modal-ops">
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn" disabled={busy} onClick={submit}>添加</button>
      </div>
    </Modal>
  );
}
