import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import MapView, { type MapPoint } from '../components/MapView';

/* ============ 飞哪里：按票价探索目的地（移植自 icecolaa/flywhere） ============ */

interface FlightResult {
  id: string; city: string; code: string; coord: [number, number] | null; domestic: boolean;
  date: string; backDate: string; airline: string;
  out: string; outArr: string; back: string; backArr: string; direct: boolean;
  duration: number; fare: number; fees: number; feeSource: string;
  perPerson: number; totalPrice: number; passengers: number; rank: number; jumpUrl: string;
  weather?: { date: string; icon: string; tempMax: number | null; tempMin: number | null }[];
}
interface Advice { summary: string; advice: { id: string; label: string; reason: string }[] }

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function FlyWherePage() {
  const { toast } = useApp();
  const [form, setForm] = useState({
    origin: '广州', destination: '', trip: 'round' as 'round' | 'oneway',
    depDate: plusDays(7), backDate: plusDays(10), passengers: 1,
  });
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<FlightResult[] | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (busy) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [busy]);

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const search = async () => {
    if (busy) return;
    if (!form.origin.trim()) { toast('请填写出发城市', true); return; }
    if (form.trip === 'round' && form.backDate < form.depDate) { toast('回程日期不能早于出发日期', true); return; }
    setBusy(true);
    setAdvice(null);
    setResults(null);
    try {
      const r = await api.post<{ results: FlightResult[]; count: number; minPrice: number | null }>('/api/flywhere/search', form);
      setResults(r.results);
      toast(`探索到 ${r.count} 个组合` + (r.minPrice != null ? `，最低总价 ¥${r.minPrice.toLocaleString()}` : ''));
    } catch (e: any) {
      toast(e.message || '搜索失败', true);
    } finally {
      setBusy(false);
    }
  };

  const askAdvice = async () => {
    if (!results?.length || adviceBusy) return;
    setAdviceBusy(true);
    try {
      setAdvice(await api.post<Advice>('/api/flywhere/ai-advice', { results: results.slice(0, 12) }));
    } catch (e: any) {
      toast(e.message || 'AI 建议失败', true);
    } finally {
      setAdviceBusy(false);
    }
  };

  const points = useMemo<MapPoint[]>(() => {
    if (!results) return [];
    const seen = new Set<string>();
    const pts: MapPoint[] = [];
    for (const r of results) {
      if (!r.coord || seen.has(r.code)) continue;
      seen.add(r.code);
      pts.push({
        id: results.indexOf(r), lat: r.coord[1], lng: r.coord[0],
        title: r.city, subtitle: `最低总价 ¥${r.totalPrice.toLocaleString()} / 人`,
        dayNumber: r.rank,
      });
    }
    return pts;
  }, [results]);

  const adviceFor = (id: string) => advice?.advice.find(a => a.id === id);
  const uniqCities = results ? new Set(results.map(r => r.code)).size : 0;
  const minPrice = results?.length ? Math.min(...results.map(r => r.totalPrice)) : null;

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <h1>✈️ 飞哪里</h1>
          <div className="sub">根据票价，决定飞哪里 —— 固定日期，探索低价目的地</div>
        </div>
      </div>

      <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div className="fw-grid">
          <div className="field">
            <label>出发城市</label>
            <input className="input" value={form.origin} onChange={e => set({ origin: e.target.value })} placeholder="例如：广州" maxLength={20} />
          </div>
          <div className="field">
            <label>目的地（留空 = 全国探索）</label>
            <input className="input" value={form.destination} onChange={e => set({ destination: e.target.value })} placeholder="留空探索全国低价" maxLength={20} />
          </div>
          <div className="field">
            <label>类型 / 人数</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="input" value={form.trip} onChange={e => set({ trip: e.target.value as 'round' | 'oneway' })}>
                <option value="round">往返</option>
                <option value="oneway">单程</option>
              </select>
              <input className="input" type="number" min={1} max={9} value={form.passengers}
                onChange={e => set({ passengers: Math.max(1, Number(e.target.value) || 1) })} title="出行人数" />
            </div>
          </div>
          <div className="field">
            <label>出发日期</label>
            <input className="input" type="date" value={form.depDate} min={plusDays(1)} onChange={e => set({ depDate: e.target.value })} />
          </div>
          <div className="field">
            <label>回程日期{form.trip === 'oneway' ? '（单程无需）' : ''}</label>
            <input className="input" type="date" value={form.backDate} min={form.depDate} disabled={form.trip === 'oneway'}
              onChange={e => set({ backDate: e.target.value })} />
          </div>
        </div>
        <div className="row-ops" style={{ marginTop: 4 }}>
          <button className="btn primary" onClick={search} disabled={busy}>
            {busy ? `搜索中… 已等待 ${elapsed} 秒` : '🔍 搜索低价目的地'}
          </button>
          <span className="muted">全国探索通常需要 10~40 秒（多轮真实航班查询）；指定目的地会更快</span>
        </div>
      </div>

      {results && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
          <div className="row-ops">
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                探索结果 · {uniqCities} 个目的地 / {results.length} 个组合
              </h2>
              {minPrice != null && <div className="muted" style={{ marginTop: 4 }}>最低总价 <b style={{ color: 'var(--orange)' }}>¥{minPrice.toLocaleString()}</b>（{form.passengers} 人）</div>}
            </div>
            <button className="btn sm" onClick={askAdvice} disabled={adviceBusy}>{adviceBusy ? 'AI 分析中…' : '✨ AI 建议'}</button>
          </div>
          {advice && (
            <div className="fw-advice">
              <div className="fw-advice-summary">💡 {advice.summary}</div>
              <div className="fw-advice-grid">
                {advice.advice.map(a => (
                  <div key={a.label + a.id} className="fw-advice-item">
                    <b>{a.label}</b>
                    <span>{a.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {points.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <MapView points={points} height={380} />
              <p className="cap" style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)', margin: '4px 0 0' }}>
                地图标记为各目的地最低总价（颜色按价格排名）
              </p>
            </div>
          )}
        </div>
      )}

      {results?.map(r => {
        const adv = adviceFor(r.id);
        const wx = r.weather?.[0];
        return (
          <div className="card fw-card" key={r.id}>
            <div className="fw-card-head">
              <span className="fw-rank" style={r.rank === 1 ? { background: 'var(--orange)' } : undefined}>#{r.rank}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fw-city">
                  {r.city}{r.domestic ? '' : '（国际/地区）'}
                  {r.rank === 1 && <span className="tag orange" style={{ marginLeft: 8 }}>最低价</span>}
                  {r.direct && <span className="tag" style={{ marginLeft: 8 }}>直达</span>}
                  {!r.direct && <span className="tag gray" style={{ marginLeft: 8 }}>中转</span>}
                </div>
                <div className="muted" style={{ marginTop: 2 }}>
                  {r.date} {r.out} 出发 → {r.backDate && r.back !== '—' ? `${r.backDate} ${r.back} 返回` : ''} · {r.airline} · 飞行 {r.duration} 小时
                  {wx && wx.tempMax != null ? ` · ${wx.icon} ${wx.tempMax}°/${wx.tempMin}°` : ''}
                </div>
              </div>
              <div className="fw-price">
                <div className="fw-price-total">¥{r.totalPrice.toLocaleString()}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{form.passengers} 人总价</div>
                <div className="muted" style={{ fontSize: 11.5 }}>票价 ¥{r.fare.toLocaleString()} + 机建燃油 ¥{r.fees}</div>
              </div>
            </div>
            <div className="fw-card-foot">
              <span className="muted">时长 {r.duration} 小时 · {r.feeSource}</span>
              <a className="btn sm primary" href={r.jumpUrl} target="_blank" rel="noreferrer">去飞猪下单 ↗</a>
            </div>
            {adv && (
              <div className="fw-advice-flag">
                <b>{adv.label}</b> {adv.reason}
              </div>
            )}
          </div>
        );
      })}

      {results && !results.length && (
        <div className="card empty"><span className="big">🛫</span>没有找到符合条件的结果，试试调整日期或目的地</div>
      )}
    </div>
  );
}
