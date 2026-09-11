import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { Modal, fmtDate } from '../components/ui';
import MapView, { type MapPoint } from '../components/MapView';

/* ============ 飞哪儿 FlyWhere：按票价探索目的地（移植自 icecolaa/flywhere） ============ */

interface FlightResult {
  id: string; city: string; code: string; coord: [number, number] | null; domestic: boolean;
  date: string; backDate: string; airline: string;
  out: string; outArr: string; back: string; backArr: string; direct: boolean;
  duration: number; journeyDuration?: number; layoverMinutes?: number;
  fare: number; fees: number; feeSource: string;
  perPerson: number; totalPrice: number; passengers: number; rank: number; jumpUrl: string;
  weather?: { date: string; icon: string; tempMax: number | null; tempMin: number | null }[];
}
interface Advice { summary: string; advice: { id: string; label: string; reason: string }[] }
interface FeePolicy { airportConstruction: number; shortHaulFuelSurcharge: number; longHaulFuelSurcharge: number; thresholdKm: number; updatedAt: string; source: string }
interface SearchQuery {
  origin: string; destination: string; trip: 'round' | 'oneway';
  depDate: string; backDate: string; passengers: number;
  outTimeStart: string; outTimeEnd: string; backTimeStart: string; backTimeEnd: string;
}
interface HistoryEntry { id: number; ts: number; query: SearchQuery; results: FlightResult[] }

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || ''); return v ?? fallback; } catch { return fallback; }
}
function saveJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 容量满等情况忽略 */ }
}

/** 时间段偏好：select 存 "HH:MM-HH:MM"，查询时拆成起止 */
const TIME_WINDOWS = [
  { value: '', label: '任意时间' },
  { value: '00:00-08:00', label: '清晨 00–08' },
  { value: '08:00-13:00', label: '上午 08–13' },
  { value: '13:00-18:00', label: '下午 13–18' },
  { value: '18:00-23:59', label: '晚间 18–24' },
];
const winPart = (win: string, idx: 0 | 1) => (win ? win.split('-')[idx] : '');
const winKeyOf = (start: string, end: string) => (start && end ? `${start}-${end}` : '');
const winLabel = (win: string) => TIME_WINDOWS.find(w => w.value === win)?.label || '';

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function FlyWherePage() {
  const { toast } = useApp();
  const [form, setForm] = useState({
    origin: '北京', destination: '', trip: 'round' as 'round' | 'oneway',
    depDate: plusDays(7), backDate: plusDays(10), passengers: 1,
  });
  const [outWin, setOutWin] = useState('');
  const [backWin, setBackWin] = useState('');
  const [prefOpen, setPrefOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<FlightResult[] | null>(null);
  const [trend, setTrend] = useState<{ deltaPerPerson: number; checkedAt: string } | null>(null);
  const [restoredTs, setRestoredTs] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<'map' | 'list'>('map');
  const [mode, setMode] = useState<'dest' | 'all'>('dest');
  const [sortKey, setSortKey] = useState<'price' | 'duration' | 'direct'>('price');
  const [airline, setAirline] = useState('');
  const [dirFilter, setDirFilter] = useState('');
  const [durMax, setDurMax] = useState(0);
  const [openCity, setOpenCity] = useState<string | null>(null);

  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceOpen, setAdviceOpen] = useState(true);
  const [adviceBusy, setAdviceBusy] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>(() => loadJSON<HistoryEntry[]>('gotrip_fw_history', []));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [visited, setVisited] = useState<string[]>(() => loadJSON<string[]>('gotrip_fw_visited', []));
  const [feeOpen, setFeeOpen] = useState(false);
  const [fee, setFee] = useState<FeePolicy | null>(null);

  useEffect(() => {
    if (busy) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [busy]);

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const queryOf = (): SearchQuery => ({
    origin: form.origin.trim(), destination: form.destination.trim(), trip: form.trip,
    depDate: form.depDate, backDate: form.trip === 'round' ? form.backDate : '', passengers: form.passengers,
    outTimeStart: winPart(outWin, 0), outTimeEnd: winPart(outWin, 1),
    backTimeStart: form.trip === 'round' ? winPart(backWin, 0) : '', backTimeEnd: form.trip === 'round' ? winPart(backWin, 1) : '',
  });

  const resetFilters = () => { setAirline(''); setDirFilter(''); setDurMax(0); setOpenCity(null); };

  const search = async () => {
    if (busy) return;
    if (!form.origin.trim()) { toast('请填写出发城市', true); return; }
    if (form.trip === 'round' && form.backDate < form.depDate) { toast('回程日期不能早于出发日期', true); return; }
    setBusy(true);
    setAdvice(null);
    setAdviceOpen(true);
    setResults(null);
    setTrend(null);
    setRestoredTs(null);
    resetFilters();
    try {
      const r = await api.post<{ results: FlightResult[]; count: number; minPrice: number | null; trend?: { deltaPerPerson: number; checkedAt: string } | null }>('/api/flywhere/search', queryOf());
      setResults(r.results);
      setTrend(r.trend || null);
      const entry: HistoryEntry = { id: Date.now(), ts: Date.now(), query: queryOf(), results: r.results };
      setHistory(prev => {
        const next = [entry, ...prev.filter(h => h.id !== entry.id)].slice(0, 12);
        saveJSON('gotrip_fw_history', next);
        return next;
      });
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
    setAdviceOpen(true);
    try {
      setAdvice(await api.post<Advice>('/api/flywhere/ai-advice', { results: results.slice(0, 12) }));
    } catch (e: any) {
      toast(e.message || 'AI 建议失败', true);
    } finally {
      setAdviceBusy(false);
    }
  };

  const restore = (h: HistoryEntry) => {
    setForm({
      origin: h.query.origin, destination: h.query.destination, trip: h.query.trip,
      depDate: h.query.depDate, backDate: h.query.backDate || h.query.depDate, passengers: h.query.passengers,
    });
    setOutWin(winKeyOf(h.query.outTimeStart, h.query.outTimeEnd));
    setBackWin(winKeyOf(h.query.backTimeStart, h.query.backTimeEnd));
    setResults(h.results);
    setAdvice(null);
    setTrend(null);
    setRestoredTs(h.ts);
    resetFilters();
    setHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeHistory = (id: number) => setHistory(prev => {
    const next = prev.filter(h => h.id !== id);
    saveJSON('gotrip_fw_history', next);
    return next;
  });
  const clearHistory = () => { setHistory([]); saveJSON('gotrip_fw_history', []); };

  const toggleVisited = (city: string) => setVisited(prev => {
    const next = prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city];
    saveJSON('gotrip_fw_visited', next);
    return next;
  });

  const openFee = async () => {
    setFeeOpen(true);
    if (!fee) { try { setFee(await api.get<FeePolicy>('/api/flywhere/fee-policy')); } catch { /* 用兜底文案 */ } }
  };

  /* ---------------- 结果的客户端筛选 / 排序 / 分组 ---------------- */

  const airlines = useMemo(() => {
    const set = new Set<string>();
    for (const r of results || []) r.airline.split(' / ').forEach(a => a && set.add(a));
    return [...set];
  }, [results]);

  const filtered = useMemo(() => {
    let list = results || [];
    if (airline) list = list.filter(r => r.airline.split(' / ').includes(airline));
    if (dirFilter === 'direct') list = list.filter(r => r.direct);
    if (dirFilter === 'transfer') list = list.filter(r => !r.direct);
    if (durMax) list = list.filter(r => r.duration <= durMax);
    const sorted = [...list];
    if (sortKey === 'duration') sorted.sort((a, b) => a.duration - b.duration || a.totalPrice - b.totalPrice);
    else if (sortKey === 'direct') sorted.sort((a, b) => Number(b.direct) - Number(a.direct) || a.totalPrice - b.totalPrice);
    else sorted.sort((a, b) => a.totalPrice - b.totalPrice);
    return sorted;
  }, [results, airline, dirFilter, durMax, sortKey]);

  const dests = useMemo(() => {
    const groups = new Map<string, FlightResult[]>();
    for (const r of filtered) {
      if (!groups.has(r.code)) groups.set(r.code, []);
      groups.get(r.code)!.push(r);
    }
    return [...groups.values()].map(combos => ({
      code: combos[0].code, city: combos[0].city, best: combos[0], combos,
      airlinesCount: new Set(combos.flatMap(r => r.airline.split(' / '))).size,
    })).sort((a, b) => a.best.totalPrice - b.best.totalPrice);
  }, [filtered]);

  const points = useMemo<MapPoint[]>(() => {
    if (view !== 'map') return [];
    return dests.map((d, i) => (d.best.coord ? {
      id: i, lat: d.best.coord[1], lng: d.best.coord[0],
      title: d.city, subtitle: `最低总价 ¥${d.best.totalPrice.toLocaleString()} · ${d.combos.length} 组组合`,
      dayNumber: d.best.rank,
    } : null)).filter(Boolean) as MapPoint[];
  }, [dests, view]);

  const uniqCities = dests.length;
  const minPrice = filtered.length ? Math.min(...filtered.map(r => r.totalPrice)) : null;
  const hasActiveFilter = Boolean(airline || dirFilter || durMax);
  const adviceFor = (id: string) => advice?.advice.find(a => a.id === id);
  const tripLabel = form.trip === 'round' ? '往返' : '单程';

  /* ---------------- 子组件 ---------------- */

  const priceBlock = (r: FlightResult) => (
    <div className="fw-price">
      <div className="fw-price-total">¥{r.totalPrice.toLocaleString()}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{form.passengers} 人总价</div>
      <div className="muted" style={{ fontSize: 11.5 }}>票面 ¥{r.fare.toLocaleString()} + 机建燃油 ¥{r.fees}</div>
    </div>
  );

  const cityTags = (r: FlightResult) => (
    <>
      {r.rank === 1 && <span className="tag orange">最低价</span>}
      <span className="tag gray">{r.direct ? '直达' : '中转'}</span>
      {visited.includes(r.city) && <span className="fw-tag-visited">已去过</span>}
    </>
  );

  const journeyText = (r: FlightResult) => {
    const parts = [`飞行 ${r.duration} 小时`];
    if (r.journeyDuration && r.journeyDuration > r.duration) parts.push(`总行程 ${r.journeyDuration} 小时`);
    if (r.layoverMinutes && r.layoverMinutes > 0) parts.push(`中转等待 ${r.layoverMinutes} 分钟`);
    return parts.join(' · ');
  };

  const ComboCard = ({ r }: { r: FlightResult }) => {
    const adv = adviceFor(r.id);
    const legs = r.airline.split(' / ');
    const hasBack = r.back && r.back !== '—';
    return (
      <div className="card fw-card">
        <div className="fw-card-head">
          <span className="fw-rank" style={r.rank === 1 ? { background: 'var(--orange)' } : undefined}>#{r.rank}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="fw-city">{r.city}{r.domestic ? '' : '（国际/地区）'}{cityTags(r)}</div>
            <div className="fw-legs">
              <div className="fw-leg">
                <div className="fw-leg-cap"><span>去程 {r.date.slice(5).replace('-', '/')}</span><span>{r.direct ? '直飞' : ''}</span></div>
                <div className="fw-leg-line">{r.out}<span className="arrow" />{r.outArr || '—'}</div>
                <div className="fw-leg-air">{legs[0] || '—'}</div>
              </div>
              {hasBack && (
                <div className="fw-leg">
                  <div className="fw-leg-cap"><span>回程 {r.backDate.slice(5).replace('-', '/')}</span></div>
                  <div className="fw-leg-line">{r.back}<span className="arrow" />{r.backArr || '—'}</div>
                  <div className="fw-leg-air">{legs[1] || legs[0] || '—'}</div>
                </div>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {journeyText(r)}
              {r.weather?.[0] && r.weather[0].tempMax != null ? ` · ${r.weather[0].icon} ${r.weather[0].tempMax}°/${r.weather[0].tempMin}°` : ''}
            </div>
          </div>
          {priceBlock(r)}
        </div>
        <div className="fw-card-foot">
          <span className="muted">{r.feeSource}</span>
          <a className="btn sm primary" href={r.jumpUrl} target="_blank" rel="noreferrer">去飞猪下单 ↗</a>
        </div>
        {adv && <div className="fw-advice-flag"><b>{adv.label}</b> {adv.reason}</div>}
      </div>
    );
  };

  const DestCard = ({ d }: { d: typeof dests[number] }) => {
    const wx = d.best.weather?.[0];
    const expanded = openCity === d.code;
    return (
      <div className="fw-dest">
        <div className="fw-dest-head">
          <span className="fw-code">{d.code}</span>
          <b className="fw-dest-city">{d.city}</b>
          {visited.includes(d.city) && <span className="fw-tag-visited">已去过</span>}
          <span className="fw-dest-price">¥{d.best.totalPrice.toLocaleString()}</span>
        </div>
        <div className="fw-dest-meta">
          {d.airlinesCount} 家航司 · {d.combos.length} 组组合 · {tripLabel} · {form.passengers} 位成人
          <br />去 {d.best.out}–{d.best.outArr || '—'}{d.best.back && d.best.back !== '—' ? ` · 回 ${d.best.back}–${d.best.backArr || '—'}` : ''}
          {' · '}{journeyText(d.best)}
          {wx && wx.tempMax != null ? <><br />{wx.icon} {wx.date} {wx.tempMax}° / {wx.tempMin}°</> : ''}
        </div>
        <div className="fw-dest-ops">
          <button className="btn sm" onClick={() => toggleVisited(d.city)}>{visited.includes(d.city) ? '取消去过' : '标记已去过'}</button>
          <button className="btn sm" onClick={() => setOpenCity(expanded ? null : d.code)}>{expanded ? '收起组合' : `查看 ${d.combos.length} 组合`}</button>
          <a className="btn sm primary" href={d.best.jumpUrl} target="_blank" rel="noreferrer">去飞猪 ↗</a>
        </div>
        {expanded && <div className="fw-dest-combos">{d.combos.map(r => <ComboCard key={r.id} r={r} />)}</div>}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <h1>飞哪儿</h1>
          <div className="sub">根据票价，决定飞哪儿 —— 固定日期，探索低价目的地</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={() => setHistoryOpen(true)}>查询记录{history.length ? ` · ${history.length}` : ''}</button>
        </div>
      </div>

      <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div className="fw-grid">
          <div className="field">
            <label>出发城市</label>
            <input className="input" value={form.origin} onChange={e => set({ origin: e.target.value })} placeholder="例如：北京" maxLength={20} />
          </div>
          <div className="field">
            <label>目的地（留空 = 全国探索）</label>
            <input className="input" value={form.destination} onChange={e => set({ destination: e.target.value })} placeholder="留空探索全国低价" maxLength={20} />
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
          <div className="field">
            <label>行程</label>
            <div className="fw-seg">
              <button className={form.trip === 'round' ? 'on' : ''} onClick={() => set({ trip: 'round' })}>往返</button>
              <button className={form.trip === 'oneway' ? 'on' : ''} onClick={() => set({ trip: 'oneway' })}>单程</button>
            </div>
          </div>
          <div className="field">
            <label>人数（总价按人数换算）</label>
            <div className="fw-step">
              <button onClick={() => set({ passengers: Math.max(1, form.passengers - 1) })} title="减少">−</button>
              <input type="number" min={1} max={9} value={form.passengers}
                onChange={e => set({ passengers: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} />
              <button onClick={() => set({ passengers: Math.min(9, form.passengers + 1) })} title="增加">＋</button>
            </div>
          </div>
        </div>

        <div className="row-ops" style={{ marginTop: 4 }}>
          <button className="btn primary" onClick={search} disabled={busy}>
            {busy ? `搜索中… 已等待 ${elapsed} 秒` : '搜索低价目的地'}
          </button>
          <span className="muted">全国探索通常需要 10~40 秒（多轮真实航班查询）；指定目的地会更快</span>
        </div>

        <div className="fw-chiprow">
          <span className="fw-chip">{form.destination.trim() || '全国探索 · 不限目的地'}</span>
          <span className="fw-chip">{fmtDate(form.depDate)} 出发</span>
          {form.trip === 'round' && <span className="fw-chip">{fmtDate(form.backDate)} 返回</span>}
          <span className="fw-chip">{form.passengers} 位成人</span>
          {outWin && <span className="fw-chip">{winLabel(outWin)} 出发</span>}
          {form.trip === 'round' && backWin && <span className="fw-chip">{winLabel(backWin)} 返回</span>}
          <span className="fw-spacer" />
          <button className="fw-chip fw-chip-btn" onClick={() => setPrefOpen(v => !v)}>{prefOpen ? '收起偏好' : '时间与偏好'}</button>
        </div>

        {prefOpen && (
          <div className="fw-pref">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>去程出发时间段</label>
              <select className="input" value={outWin} onChange={e => setOutWin(e.target.value)}>
                {TIME_WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>回程出发时间段{form.trip === 'oneway' ? '（单程无需）' : ''}</label>
              <select className="input" value={backWin} disabled={form.trip === 'oneway'} onChange={e => setBackWin(e.target.value)}>
                {TIME_WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {restoredTs != null && (
        <div className="fw-restore">
          <span>已从本地查询记录恢复 {fmtTs(restoredTs)} 的历史快照，不重新请求飞猪；价格可能已变化，建议重新搜索。</span>
          <button className="btn sm" onClick={search}>重新搜索</button>
        </div>
      )}

      {results && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
          <div className="row-ops">
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                探索结果 · {uniqCities} 个目的地 / {filtered.length} 组组合
              </h2>
              <div className="muted" style={{ marginTop: 4 }}>
                {tripLabel} · {form.passengers} 位成人
                {minPrice != null && <> · 最低总价 <b style={{ color: 'var(--orange)' }}>¥{minPrice.toLocaleString()}</b></>}
                {restoredTs != null && ' · 历史快照'}
                {trend && !restoredTs && (
                  <span className="tag" style={{ marginLeft: 8, color: trend.deltaPerPerson > 0 ? 'var(--green-deep)' : trend.deltaPerPerson < 0 ? '#a05616' : undefined }}>
                    {trend.deltaPerPerson > 0 ? `较上次 ↓¥${Math.abs(trend.deltaPerPerson).toLocaleString()}/人` : trend.deltaPerPerson < 0 ? `较上次 ↑¥${Math.abs(trend.deltaPerPerson).toLocaleString()}/人` : '与上次持平'}（{fmtTs(new Date(trend.checkedAt).getTime())} 查过）
                  </span>
                )}
              </div>
            </div>
            <div className="fw-seg">
              <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>地图</button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>列表</button>
            </div>
            <button className="btn sm" onClick={askAdvice} disabled={adviceBusy}>{adviceBusy ? 'AI 分析中…' : 'AI 建议'}</button>
            <button className="btn sm ghost" onClick={openFee}>价格说明</button>
          </div>

          <div className="fw-filterbar">
            <select className="input fw-mini" value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)} title="排序">
              <option value="price">价格最低</option>
              <option value="duration">飞行最短</option>
              <option value="direct">直飞优先</option>
            </select>
            <select className="input fw-mini" value={airline} onChange={e => setAirline(e.target.value)}>
              <option value="">全部航司</option>
              {airlines.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="input fw-mini" value={dirFilter} onChange={e => setDirFilter(e.target.value)}>
              <option value="">直飞与中转</option>
              <option value="direct">仅直飞</option>
              <option value="transfer">仅中转</option>
            </select>
            <select className="input fw-mini" value={durMax} onChange={e => setDurMax(Number(e.target.value))}>
              <option value={0}>全部时长</option>
              <option value={3}>≤ 3 小时</option>
              <option value={5}>≤ 5 小时</option>
              <option value={8}>≤ 8 小时</option>
            </select>
            {hasActiveFilter && <button className="btn sm ghost" onClick={() => resetFilters()}>清除筛选</button>}
            {view === 'list' && (
              <div className="fw-seg" style={{ marginLeft: 'auto' }}>
                <button className={mode === 'dest' ? 'on' : ''} onClick={() => setMode('dest')}>按目的地</button>
                <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>全部组合</button>
              </div>
            )}
          </div>

          {advice && adviceOpen && (
            <div className="fw-advice">
              <div className="row-ops">
                <div className="fw-advice-summary" style={{ flex: 1, minWidth: 200 }}>{advice.summary}</div>
                <button className="btn sm ghost" onClick={askAdvice} disabled={adviceBusy}>{adviceBusy ? '生成中…' : '重新生成'}</button>
                <button className="btn sm ghost" onClick={() => setAdviceOpen(false)}>收起</button>
              </div>
              <div className="fw-advice-grid">
                {advice.advice.map(a => {
                  const r = results?.find(x => x.id === a.id);
                  return (
                    <div key={a.label + a.id} className="fw-advice-item">
                      <b>{a.label}</b>
                      {r && (
                        <span className="fw-advice-target">
                          <span>{r.city} · {r.direct ? '直飞' : '中转'}</span>
                          <b style={{ color: 'var(--orange)' }}>¥{r.totalPrice.toLocaleString()}</b>
                        </span>
                      )}
                      <span>{a.reason}</span>
                    </div>
                  );
                })}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>AI 建议不改变价格排序，仅辅助决策</div>
            </div>
          )}

          {view === 'map' && (
            points.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                <MapView points={points} height={420} showRoute={false} />
                <p className="cap" style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)', margin: '4px 0 0' }}>
                  地图标记为各目的地最低总价组合（编号即价格排名），点击标记查看详情
                </p>
              </div>
            ) : (
              <div className="card empty" style={{ marginTop: 10 }}><span className="big">🗺️</span>当前筛选下没有可标注的目的地</div>
            )
          )}

          {view === 'list' && (
            filtered.length ? (
              mode === 'dest' ? (
                <div className="fw-dests">
                  {dests.map(d => <DestCard key={d.code} d={d} />)}
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  {filtered.map(r => <ComboCard key={r.id} r={r} />)}
                </div>
              )
            ) : (
              <div className="card empty"><span className="big">🛫</span>没有组合符合当前筛选<button className="btn sm" style={{ marginLeft: 10 }} onClick={() => resetFilters()}>清除筛选</button></div>
            )
          )}
        </div>
      )}

      {results && !results.length && (
        <div className="card empty"><span className="big">🛫</span>没有找到符合条件的结果，试试调整日期或目的地</div>
      )}

      <p className="fw-foot">最终价格与余票以飞猪下单页为准 · 天气预报来自 Open-Meteo · 数据仅供出行决策参考</p>

      {historyOpen && (
        <Modal title="查询记录" onClose={() => setHistoryOpen(false)} width={560}>
          <p className="muted" style={{ marginTop: -6 }}>保存在当前设备。恢复记录不会重新请求飞猪，价格是保存时的快照，需实时价格请重新搜索。</p>
          {history.length > 0 && (
            <div className="row-ops" style={{ justifyContent: 'space-between' }}>
              <span className="muted">已保存 {history.length} 条 · 最多保留 12 条</span>
              <button className="btn sm danger" onClick={clearHistory}>清空记录</button>
            </div>
          )}
          {history.map(h => (
            <div className="fw-hist-item" key={h.id}>
              <div className="fw-hist-head">
                <span className="fw-hist-title">{h.query.origin} → {h.query.destination || '全国探索'}</span>
                <span className="fw-hist-time">{fmtTs(h.ts)}</span>
              </div>
              <div className="fw-hist-meta">
                {fmtDate(h.query.depDate)}{h.query.trip === 'round' ? ` — ${fmtDate(h.query.backDate)}` : ''} · {h.results.length} 组组合 ·{' '}
                {new Set(h.results.map(r => r.code)).size} 个目的地 · {h.query.trip === 'round' ? '往返' : '单程'} · {h.query.passengers} 位成人
              </div>
              <div className="row-ops" style={{ justifyContent: 'flex-end' }}>
                <button className="btn sm danger" onClick={() => removeHistory(h.id)}>删除</button>
                <button className="btn sm primary" onClick={() => restore(h)}>恢复查看</button>
              </div>
            </div>
          ))}
          {!history.length && <div className="empty"><span className="big">📭</span>暂无查询记录，搜索后会自动保存最近 12 条</div>}
        </Modal>
      )}

      {feeOpen && (
        <Modal title="价格说明" onClose={() => setFeeOpen(false)} width={520}>
          <ul className="fw-fee-list">
            <li>展示 <b>{form.passengers} 位成人</b>的{tripLabel}预估总价：票面价 + 燃油附加费 + 机场建设费。</li>
            <li>接口返回税费明细时优先使用接口值（费用来源标注在组合卡片上）；未返回明细时按每个航段的大圆距离估算：
              ≤{fee?.thresholdKm ?? 800} 公里机建 ¥{fee?.airportConstruction ?? 50} + 燃油 ¥{fee?.shortHaulFuelSurcharge ?? 40}，
              超过则燃油 ¥{fee?.longHaulFuelSurcharge ?? 70}。</li>
            <li>修改人数不会重新查询航班，仅按人数换算总价。</li>
            <li>最终价格与余票以飞猪下单页为准。{fee?.updatedAt ? `费率更新于 ${fee.updatedAt}。` : ''}</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
