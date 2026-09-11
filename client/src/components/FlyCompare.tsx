import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { fmtDate } from './ui';

/* ============================================================
 * 飞哪儿 · 跨平台比价工作台
 * 形态参考 flight-price-assistant（Chrome 扩展，MIT）：四平台一键检索、
 * 含税总价与价格类型分类、可信度分组、服务器历史与分位数。
 * 架构差异：Web 应用无法注入第三方页面脚本读取价格（扩展专属能力），
 * 故「自动读取」以参数自动带入 + 人工录入确认的方式实现。
 * ============================================================ */

export interface FlyCompareQuery {
  origin: string; destination: string; trip: 'round' | 'oneway';
  depDate: string; backDate: string; passengers: number;
}

type PlatformKey = 'ctrip' | 'qunar' | 'fliggy' | 'tongcheng';
type PriceType = 'taxed' | 'public' | 'member' | 'coupon' | 'floor';

interface CompareEntry {
  id: string;
  platform: PlatformKey;
  flightNo: string;
  out: string;
  arr: string;
  basePrice: number | null;
  tax: number | null;
  priceType: PriceType;
  note: string;
  jumpUrl: string;
}

interface CompareGroup {
  rule: 'flight-no' | 'times' | 'route-only';
  confidence: number;
  title: string;
  entries: CompareEntry[];
  minTaxTotal: number | null;
}

interface CompareStats { count: number; percentile: number; level: 'low' | 'mid' | 'high' | 'insufficient'; minEver: number; maxEver: number }

const PLATFORM_META: Record<PlatformKey, { name: string; home: string }> = {
  ctrip: { name: '携程', home: 'https://flights.ctrip.com/' },
  qunar: { name: '去哪儿', home: 'https://flight.qunar.com/' },
  fliggy: { name: '飞猪', home: 'https://flight.fliggy.com/' },
  tongcheng: { name: '同程', home: 'https://flight.ly.com/' },
};
const PRICE_TYPES: { value: PriceType; label: string }[] = [
  { value: 'taxed', label: '含税已校验' },
  { value: 'public', label: '公开价' },
  { value: 'member', label: '会员价' },
  { value: 'coupon', label: '券后价' },
  { value: 'floor', label: '起步价' },
];
const enc = encodeURIComponent;

/** 平台检索链接（尽力带入参数；携程/飞猪列表页需城市码，回退首页并复制参数） */
function platformUrl(key: PlatformKey, q: FlyCompareQuery): { url: string; deep: boolean } {
  const round = q.trip === 'round';
  switch (key) {
    case 'qunar':
      return { deep: true, url: `https://flight.qunar.com/site/fly2.htm?searchType=${round ? 'RoundTripFlight' : 'OneWayFlight'}&fromCity=${enc(q.origin)}&toCity=${enc(q.destination)}&fromDate=${q.depDate}${round ? `&toDate=${q.backDate}` : ''}` };
    case 'tongcheng':
      return { deep: true, url: `https://flight.ly.com/flightlist?fromcity=${enc(q.origin)}&tocity=${enc(q.destination)}&fromdate=${q.depDate}${round ? `&backdate=${q.backDate}` : ''}&triptype=${round ? 2 : 1}` };
    default:
      return { deep: false, url: PLATFORM_META[key].home };
  }
}

function taxTotalOf(e: CompareEntry): number | null {
  if (e.priceType === 'floor') return null;
  if (e.priceType === 'taxed') return e.basePrice != null ? e.basePrice : null;
  if (e.basePrice != null && e.tax != null) return Math.round((e.basePrice + e.tax) * 100) / 100;
  return null;
}

/** 跨平台分组与可信度：航班号一致 95 / 起降时间一致 80 / 仅同航线 60 */
function groupEntries(entries: CompareEntry[]): CompareGroup[] {
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
  const groups: CompareGroup[] = [];
  const used = new Set<string>();
  const byFlight = new Map<string, CompareEntry[]>();
  for (const e of entries) {
    const f = norm(e.flightNo);
    if (!f || used.has(e.id)) continue;
    const list = byFlight.get(f) || [];
    list.push(e); byFlight.set(f, list);
  }
  for (const [f, list] of byFlight) {
    if (list.length >= 2) {
      list.forEach(e => used.add(e.id));
      groups.push({ rule: 'flight-no', confidence: 95, title: `航班 ${f}`, entries: list, minTaxTotal: null });
    }
  }
  const byTime = new Map<string, CompareEntry[]>();
  for (const e of entries) {
    if (used.has(e.id) || !e.out) continue;
    const key = `${norm(e.out)}-${norm(e.arr)}`;
    const list = byTime.get(key) || [];
    list.push(e); byTime.set(key, list);
  }
  for (const [key, list] of byTime) {
    if (list.length >= 2) {
      list.forEach(e => used.add(e.id));
      groups.push({ rule: 'times', confidence: 80, title: `起降 ${key}`, entries: list, minTaxTotal: null });
    }
  }
  const rest = entries.filter(e => !used.has(e.id));
  if (rest.length) groups.push({ rule: 'route-only', confidence: 60, title: '仅同航线，仅供参考', entries: rest, minTaxTotal: null });
  for (const g of groups) {
    const totals = g.entries.map(taxTotalOf).filter((v): v is number => v != null);
    g.minTaxTotal = totals.length ? Math.min(...totals) : null;
  }
  return groups.sort((a, b) => (a.minTaxTotal ?? Infinity) - (b.minTaxTotal ?? Infinity));
}

const routeKeyOf = (q: FlyCompareQuery) =>
  [q.origin || '*', q.destination || '*', q.trip, q.depDate || '*', q.backDate || '*', q.passengers || 1].join('|');

export default function FlyCompare({ query, results }: { query: FlyCompareQuery; results: any[] | null }) {
  const { toast } = useApp();
  const [entries, setEntries] = useState<CompareEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('gotrip_fw_compare_entries') || '[]'); } catch { return []; }
  });
  const [stats, setStats] = useState<CompareStats | null>(null);
  const [history, setHistory] = useState<{ id: number; minTaxTotal: number; createdAt: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { try { localStorage.setItem('gotrip_fw_compare_entries', JSON.stringify(entries.slice(0, 40))); } catch { /* ignore */ } }, [entries]);

  useEffect(() => {
    let alive = true;
    api.get<{ snapshots: { id: number; minTaxTotal: number; createdAt: string }[] }>(`/api/flywhere/compare?routeKey=${enc(routeKeyOf(query))}`)
      .then(d => { if (alive) setHistory(d.snapshots || []); })
      .catch(() => { /* 历史加载失败不影响工作台 */ });
    return () => { alive = false; };
  }, [query.origin, query.destination, query.trip, query.depDate, query.backDate, query.passengers]);

  const groups = useMemo(() => groupEntries(entries), [entries]);
  const comparable = groups.filter(g => g.minTaxTotal != null);
  const canSearch = !!(query.origin && query.destination && query.depDate);

  const addEntry = (patch?: Partial<CompareEntry>) => {
    if (entries.length >= 40) { toast('报价条数已达上限', true); return; }
    setEntries(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      platform: 'qunar', flightNo: '', out: '', arr: '', basePrice: null, tax: null,
      priceType: 'public', note: '', jumpUrl: '', ...patch,
    }]);
  };

  const importFliggy = () => {
    if (!results?.length) { toast('先搜索获取飞猪数据', true); return; }
    const picked = results.slice(0, 5).map(r => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      platform: 'fliggy' as PlatformKey, flightNo: '', out: r.time || '', arr: r.outArr && r.outArr !== '—' ? r.outArr : '',
      basePrice: r.fare ?? null, tax: r.fees ?? null, priceType: 'taxed' as PriceType,
      note: `${r.airline} · ${r.direct ? '直飞' : '中转'} · ${r.city}`, jumpUrl: r.jumpUrl || '',
    }));
    setEntries(prev => [...prev, ...picked]);
    toast(`已带入 ${picked.length} 条飞猪报价`);
  };

  const searchAll = () => {
    if (!canSearch) { toast('一键检索需要出发地、目的地和出发日期', true); return; }
    const q = query;
    let copied = false;
    const params = `${q.origin} → ${q.destination} ${q.trip === 'round' ? `往返 ${q.depDate}/${q.backDate}` : `单程 ${q.depDate}`} ${q.passengers} 位成人`;
    for (const key of ['qunar', 'tongcheng', 'ctrip', 'fliggy'] as PlatformKey[]) {
      const { url, deep } = platformUrl(key, q);
      if (!deep && !copied) {
        try { navigator.clipboard.writeText(params); copied = true; } catch { /* 剪贴板不可用忽略 */ }
      }
      window.open(url, '_blank', 'noopener');
    }
    toast(`已打开 4 个平台标签页${copied ? '，行程参数已复制（携程/飞猪首页需手动输入）' : ''}`);
  };

  const save = async () => {
    if (!comparable.length) { toast('没有可比较的含税总价（起步价或缺少税费无法直接比价）', true); return; }
    setSaving(true);
    try {
      const payload = {
        origin: query.origin, destination: query.destination, trip: query.trip,
        depDate: query.depDate, backDate: query.trip === 'round' ? query.backDate : '', passengers: query.passengers,
        city: query.destination, groups: groups.map(g => ({
          title: g.title, confidence: g.confidence, minTaxTotal: g.minTaxTotal,
          entries: g.entries.map(e => ({ platform: e.platform, flightNo: e.flightNo, out: e.out, arr: e.arr, basePrice: e.basePrice, tax: e.tax, priceType: e.priceType, total: taxTotalOf(e), note: e.note, jumpUrl: e.jumpUrl })),
        })),
      };
      const r = await api.post<{ ok: boolean; stats: CompareStats }>('/api/flywhere/compare', payload);
      setStats(r.stats);
      const h = await api.get<{ snapshots: { id: number; minTaxTotal: number; createdAt: string }[] }>(`/api/flywhere/compare?routeKey=${enc(routeKeyOf(query))}`);
      setHistory(h.snapshots || []);
      toast('比价快照已保存到服务器');
    } catch (e: any) {
      toast(e.message || '保存失败', true);
    } finally {
      setSaving(false);
    }
  };

  const levelText = (s: CompareStats | null) => !s ? '' : s.level === 'insufficient' ? `历史样本 ${s.count} 条，暂不足判断高低位` : s.level === 'low' ? `处于历史低位（超过 ${s.percentile}% 的历史记录）` : s.level === 'high' ? `处于历史高位（超过 ${s.percentile}% 的历史记录），建议再等等` : `历史中位水平（超过 ${s.percentile}% 的记录）`;

  return (
    <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
      <div className="row-ops">
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>跨平台比价工作台</h2>
        <button className="btn sm primary" onClick={searchAll} disabled={!canSearch}>⚡ 一键检索四平台</button>
        <button className="btn sm" onClick={importFliggy} disabled={!results?.length}>从飞猪结果带入</button>
        <button className="btn sm" onClick={() => addEntry()}>＋ 手动添加报价</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        去哪儿/同程自动带入行程参数；携程/飞猪列表页需城市码，将打开首页并复制行程参数。各平台的登录、验证码与价格读取需你在打开的标签页中完成，读到的价格录入下方即可参与比价。
      </div>

      {entries.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => (
            <div key={e.id} className="fw-cmp-row">
              <select className="input fw-mini" value={e.platform} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, platform: ev.target.value as PlatformKey } : x))}>
                {(['ctrip', 'qunar', 'fliggy', 'tongcheng'] as PlatformKey[]).map(k => <option key={k} value={k}>{PLATFORM_META[k].name}</option>)}
              </select>
              <input className="input fw-mini" style={{ width: 92 }} value={e.flightNo} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, flightNo: ev.target.value } : x))} placeholder="航班号" />
              <input className="input fw-mini" style={{ width: 64 }} value={e.out} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, out: ev.target.value } : x))} placeholder="起飞" />
              <input className="input fw-mini" style={{ width: 64 }} value={e.arr} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, arr: ev.target.value } : x))} placeholder="到达" />
              <input className="input fw-mini" style={{ width: 78 }} type="number" min={0} value={e.basePrice ?? ''} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, basePrice: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) } : x))} placeholder="票面价" />
              <input className="input fw-mini" style={{ width: 66 }} type="number" min={0} value={e.tax ?? ''} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, tax: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) } : x))} placeholder="税费" />
              <select className="input fw-mini" value={e.priceType} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, priceType: ev.target.value as PriceType } : x))}>
                {PRICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input className="input fw-mini" style={{ flex: 1, minWidth: 110 }} value={e.note} onChange={ev => setEntries(p => p.map(x => x.id === e.id ? { ...x, note: ev.target.value } : x))} placeholder="舱位/行李/退改摘要" />
              <button className="btn sm ghost fw-cmp-x" title="删除" onClick={() => setEntries(p => p.filter(x => x.id !== e.id))}>×</button>
            </div>
          ))}
        </div>
      )}
      {!entries.length && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>还没有报价记录：点「从飞猪结果带入」自动填入本站搜到的飞猪实价，或在各平台标签页看到价格后「手动添加报价」。</p>}

      {groups.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map((g, gi) => (
            <div key={gi} className="fw-cmp-group">
              <div className="row-ops" style={{ marginBottom: 6 }}>
                <b style={{ fontSize: 13.5 }}>{g.title}</b>
                <span className="tag" style={{ marginLeft: 6 }}>可信度 {g.confidence}%</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--serif)', fontWeight: 800, color: 'var(--orange)' }}>
                  {g.minTaxTotal != null ? `最低含税 ¥${g.minTaxTotal.toLocaleString()}` : '暂无可比含税价'}
                </span>
              </div>
              <div className="fw-cmp-grid">
                {g.entries.map(e => {
                  const total = taxTotalOf(e);
                  return (
                    <div className="fw-cmp-quote" key={e.id}>
                      <div className="row-ops" style={{ justifyContent: 'space-between' }}>
                        <b style={{ fontSize: 13 }}>{PLATFORM_META[e.platform].name}</b>
                        <span className="tag gray">{PRICE_TYPES.find(t => t.value === e.priceType)?.label}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 800, color: total != null ? 'var(--orange)' : 'var(--ink-faint)' }}>
                        {total != null ? `¥${total.toLocaleString()}` : e.priceType === 'floor' ? '起步价' : '待确认'}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {e.priceType !== 'taxed' && e.basePrice != null ? `票面 ¥${e.basePrice.toLocaleString()}${e.tax != null ? ` + 机建燃油 ¥${e.tax}` : '，附加费待平台确认'}` : (e.note || '含税')}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{[e.flightNo, e.out && `${e.out}${e.arr ? '→' + e.arr : ''}`, e.note].filter(Boolean).join(' · ')}</div>
                      {e.jumpUrl && <a className="btn sm" href={e.jumpUrl} target="_blank" rel="noreferrer">去订票 ↗</a>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="row-ops" style={{ marginTop: 10 }}>
          <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? '保存中…' : '💾 保存比价快照'}</button>
          {stats && <span className="muted" style={{ fontSize: 12.5 }}>{levelText(stats)} · 历史区间 ¥{stats.minEver.toLocaleString()} ~ ¥{stats.maxEver.toLocaleString()}（{stats.count} 条）</span>}
        </div>
      )}

      {history.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>本路线历史快照（{history.length} 条，服务器存储）</summary>
          <div className="fw-hist-list">
            {history.map(h => (
              <div key={h.id} className="fw-hist-row">
                <span>{fmtDate(h.createdAt.slice(0, 10))} · {h.createdAt.slice(11, 16)}</span>
                <b style={{ fontFamily: 'var(--serif)', color: 'var(--orange)' }}>¥{h.minTaxTotal.toLocaleString()}</b>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
