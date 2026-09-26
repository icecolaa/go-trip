import { useState } from 'react';
import { proxy } from '../rdb/proxy';
import type { Poi } from '../types';

/** POI 搜索：从内置景点库或高德（已配置 Key 时）搜索地点 */
export default function PoiSearch({ defaultCity, onPick }: { defaultCity: string; onPick: (name: string, lat: number, lng: number) => void }) {
  const [q, setQ] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [results, setResults] = useState<Poi[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const r = await proxy.get<Poi[]>(`/api/poi/search?q=${encodeURIComponent(q.trim())}&city=${encodeURIComponent(city.trim())}`);
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder="搜索地点（如：洱海、故宫）" />
        <input className="input" style={{ width: 96 }} value={city} onChange={e => setCity(e.target.value)} placeholder="城市" />
        <button className="btn sm" onClick={search} disabled={busy}>{busy ? '…' : '搜索'}</button>
      </div>
      {results != null && (
        <div style={{ maxHeight: 150, overflow: 'auto', marginTop: 6, border: '1px solid var(--line)', borderRadius: 10, background: '#fffef9' }}>
          {results.length === 0 && <div className="muted" style={{ padding: 10 }}>没找到，试试换个关键词或城市</div>}
          {results.map((p, i) => (
            <div key={i} className="poi-item" onClick={() => onPick(p.name, p.lat ?? 0, p.lng ?? 0)}>
              <span className="k">{p.kind}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{p.name}</b>
                <span className="muted" style={{ marginLeft: 6 }}>{p.city}{p.desc ? ` · ${p.desc.slice(0, 18)}` : ''}</span>
              </span>
              <button className="btn sm add">选它</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
