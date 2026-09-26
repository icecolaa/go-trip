import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../store';
import { Modal, KIND_META, fmtDate, weekOf, yuan } from '../../components/ui';
import { StatusBadge, default as StatusPicker } from '../../components/StatusPicker';
import { cashMoney } from './CashTab';
import SensitiveText from '../../components/SensitiveText';
import TripMode from '../../components/TripMode';
import { createActivity, updateActivity, deleteActivity, reorderActivities } from '../../rdb/ops';
import { proxy } from '../../rdb/proxy';
import { applyGuideToTrip } from '../../rdb/apply-guide';
import { checkupTrip } from '@shared/checkup';
import type { CheckupFinding } from '@shared/checkup';
import type { TabCtx } from './tabCtx';
import type { Activity, ActivityKind, TripDay } from '../../types';
import PoiSearch from '../../components/PoiSearch';

/** 今天（本地时区 YYYY-MM-DD） */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 跨日条目：标题/备注出现「次日」「+1 天」「第二天」即视为次日抵达 */
function isNextDayArrival(a: Activity): boolean {
  return /次日|\+1\s*天|第二天/.test(`${a.title} ${a.notes || ''}`);
}

/** WMO 天气代码 → 图标（与 open-meteo code 对应） */
function weatherIcon(code: number | null): string {
  if (code == null) return '🌤️';
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

export default function ItineraryTab({ bundle, reload, weather, canEdit, goTab }: TabCtx) {
  const { toast } = useApp();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [addingToDay, setAddingToDay] = useState<TripDay | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [tripMode, setTripMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [checkup, setCheckup] = useState<{ findings: CheckupFinding[]; warnCount: number; infoCount: number; checkedActivities: number } | null>(null);
  const [checkupBusy, setCheckupBusy] = useState(false);

  /** 行程体检：客户端纯函数计算（checkupTrip(days, activities)） */
  const runCheckup = () => {
    setCheckupBusy(true);
    try {
      const findings = checkupTrip(bundle.days, bundle.activities);
      setCheckup({
        findings,
        warnCount: findings.filter(f => f.level === 'warn').length,
        infoCount: findings.filter(f => f.level === 'info').length,
        checkedActivities: bundle.activities.length,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : '行程体检失败', true);
    } finally {
      setCheckupBusy(false);
    }
  };

  const { days, activities, members } = bundle;
  const actsByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const d of days) map.set(d.id, []);
    for (const a of activities) {
      if (!map.has(a.dayId)) map.set(a.dayId, []);
      map.get(a.dayId)!.push(a);
    }
    for (const list of map.values()) list.sort((x, y) => x.sort - y.sort || x.id.localeCompare(y.id));
    return map;
  }, [days, activities]);

  const weatherByDate = useMemo(() => new Map(weather.map(w => [w.date, w])), [weather]);

  /** 待确认中心：真实未解决项（活动 + 地点里 status=待确认/未预订）。
   *  「现场选择」「可选」「暂定」等不影响主行程的状态不计入——全部解决后本板块自动消失。 */
  const pendingItems = useMemo(() => {
    const out: { key: string; label: string; tab: string }[] = [];
    for (const a of activities) {
      if (a.status === '待确认' || a.status === '未预订') {
        out.push({ key: `a${a.id}`, label: `行程：${a.title}（${a.status}）`, tab: 'itinerary' });
      }
    }
    for (const p of bundle.places || []) {
      if (p.status === '待确认' || p.status === '未预订') {
        out.push({ key: `p${p.id}`, label: `地点：${p.name}（${p.status}）`, tab: 'places' });
      }
    }
    return out;
  }, [activities, bundle.places]);

  /** 现金项按 refKind:refId 索引，供行程/交通/住宿卡片内联显示（合计只在后端算一次） */
  const cashByRef = useMemo(() => {
    const m = new Map<string, typeof bundle.cash>();
    for (const c of bundle.cash || []) {
      if (!c.refId || !c.refKind) continue;
      const k = `${c.refKind}:${c.refId}`;
      m.set(k, [...(m.get(k) || []), c]);
    }
    return m;
  }, [bundle.cash]);

  // 默认展开当天；旅行未开始则展开第一天
  const [openDay, setOpenDay] = useState<number | null>(() => {
    const t = todayStr();
    const hit = days.find(d => d.date === t);
    if (hit) return hit.dayNumber;
    const first = [...days].sort((a, b) => a.dayNumber - b.dayNumber)[0];
    return first ? first.dayNumber : null;
  });

  /* 拖拽排序：放下后按新顺序提交 */
  const onDrop = async (targetDayId: string, beforeIndex: number) => {
    if (dragId == null) return;
    const dragged = activities.find(a => a.id === dragId);
    setDragId(null);
    if (!dragged) return;
    const me = members[0]?.displayName || '我';
    // 构造新序列
    const targetList = [...(actsByDay.get(targetDayId) || [])].filter(a => a.id !== dragId);
    targetList.splice(beforeIndex, 0, dragged);
    const items = targetList.map((a, i) => ({ id: a.id, dayId: targetDayId, sort: i }));
    try {
      await reorderActivities(bundle.trip.id, items, me);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : '排序失败', true);
    }
  };

  const removeAct = async (a: Activity) => {
    if (!confirm(`删除「${a.title}」？`)) return;
    const me = members[0]?.displayName || '我';
    try {
      await deleteActivity(bundle.trip.id, a.id, a.title, me);
      toast('已删除');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败', true);
    }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>每日行程</h2>
        <button className="btn sm" onClick={runCheckup} disabled={checkupBusy}>{checkupBusy ? '体检中…' : '🩺 行程体检'}</button>
        <button className="btn sm launch-tm" onClick={() => setTripMode(true)} disabled={!days.length}>🧭 出发模式</button>
        {canEdit && (
          <>
            <button className="btn sm" onClick={() => setAiOpen(true)}>AI 助手</button>
            <button className="btn sm primary" onClick={() => setAddingToDay(days[0] || null)} disabled={!days.length}>＋ 添加行程</button>
          </>
        )}
      </div>

      {/* 待确认中心：只汇总真实未解决项，全部解决后整块消失（导航/板块/统计一并隐藏） */}
      {pendingItems.length > 0 && (
        <div className="todo-center">
          <div className="hd">⚠️ 待确认 <span className="cnt">{pendingItems.length} 项</span></div>
          <div className="todo-list">
            {pendingItems.slice(0, 8).map(it => (
              <div className="todo-item" key={it.key}>
                <span>{it.label}</span>
                <button className="btn sm ghost go" onClick={() => goTab(it.tab)}>去处理</button>
              </div>
            ))}
          </div>
          {pendingItems.length > 8 && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>还有 {pendingItems.length - 8} 项…</p>}
        </div>
      )}

      {days.length === 0 && <div className="card empty"><span className="big">🗓️</span>还没有行程日，点击「AI 助手」一键生成，或在旅程设置里调整日期。</div>}

      {checkup && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
          <div className="row-ops">
            <h3 style={{ margin: 0, flex: 1, fontSize: 15 }}>
              🩺 行程体检 · {checkup.checkedActivities} 项安排
              {checkup.warnCount > 0 ? <span className="tag orange" style={{ marginLeft: 8 }}>{checkup.warnCount} 个需注意</span> : <span className="tag" style={{ marginLeft: 8 }}>没有发现冲突</span>}
              {checkup.infoCount > 0 && <span className="tag gray" style={{ marginLeft: 6 }}>{checkup.infoCount} 条建议</span>}
            </h3>
            <button className="btn sm ghost" onClick={() => setCheckup(null)}>收起</button>
          </div>
          {checkup.findings.length ? (
            <ul className="fw-fee-list" style={{ marginTop: 6 }}>
              {checkup.findings.map((f, i) => (
                <li key={i} style={{ color: f.level === 'warn' ? 'var(--orange)' : undefined }}>
                  {f.level === 'warn' ? '⚠️' : '💡'} D{f.dayNumber}（{fmtDate(f.date)}）：{f.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: '6px 0 0' }}>时间安排顺畅，没有发现重叠或转场过紧的问题。</p>
          )}
        </div>
      )}

      {days.map(day => {
        const acts = actsByDay.get(day.id) || [];
        const w = weatherByDate.get(day.date);
        // 当日时间范围：有时间的条目取首末
        const timed = acts.filter(a => a.time).sort((x, y) => (x.time || '').localeCompare(y.time || ''));
        const rangeStart = timed[0]?.time || '';
        const rangeEnd = timed[timed.length - 1]?.endTime || '';
        const isToday = day.date === todayStr();
        return (
          <details className="day-block day-card" key={day.id} id={`day-${day.dayNumber}`} data-day={day.dayNumber}
            open={openDay === day.dayNumber}
            onToggle={e => setOpenDay((e.currentTarget as HTMLDetailsElement).open ? day.dayNumber : null)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(day.id, acts.length)}>
            <summary className="day-head">
              <div className="day-num">
                <span className="n">D{day.dayNumber}</span>
                <span className="w">{weekOf(day.date)}</span>
              </div>
              <div className="info">
                <div className="day-head-row">
                  <span className="t">{fmtDate(day.date)}{day.title ? ` · ${day.title}` : ''}</span>
                  {isToday && <span className="tag" style={{ color: 'var(--accent)' }}>今天</span>}
                </div>
                <div className="p">📍 {day.place || '待定'} · {acts.length} 项安排</div>
                {(rangeStart || rangeEnd) && (
                  <div className="day-time-range">
                    🕘 {rangeStart || '待定'}{rangeEnd ? ` – ${rangeEnd}` : ''}
                  </div>
                )}
              </div>
              {w && w.tempMax != null && (
                <div className="day-weather" title={w.description}>
                  <span style={{ fontSize: 16 }}>{weatherIcon(w.code)}</span>
                  <span>{w.description}</span>
                  <b>{w.tempMax}° / {w.tempMin}°</b>
                </div>
              )}
            </summary>
            <div className="day-acts">
              {acts.length === 0 && <div className="empty" style={{ padding: '18px' }}>这一天还没安排，睡到自然醒也很幸福 🛌</div>}
              {acts.map((a, i) => (
                <div key={a.id}
                  className={`act-row ${dragId === a.id ? 'dragging' : ''}`}
                  draggable={canEdit}
                  onDragStart={() => setDragId(a.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.stopPropagation(); onDrop(day.id, i); }}>
                  {canEdit && <span className="drag-handle" title="拖拽排序">⋮⋮</span>}
                  <span className="act-time">
                    {a.time || '待定'}
                    {a.endTime && <span className="act-end">–{a.endTime}</span>}
                  </span>
                  <span className={`act-icon kind-${a.kind}`}>{KIND_META[a.kind]?.icon || '📌'}</span>
                  <div className="act-main">
                    <div className="act-title">
                      {a.title}
                      {isNextDayArrival(a) && <span className="ticket-nextday" style={{ marginLeft: 6 }}>次日抵达</span>}
                      {a.assigneeMemberId != null && (() => {
                        const m = members.find(m => m.id === a.assigneeMemberId);
                        return m ? <span className="tag gray">{m.displayName}负责</span> : null;
                      })()}
                    </div>
                    <div className="act-title-row2">
                      <StatusBadge status={a.status as any} />
                      {cashByRef.get(`transport:${a.id}`)?.concat(cashByRef.get(`stay:${a.id}`) || []).map(c => (
                        <span key={c.id} className="cash-inline" title={c.perPerson ? `每人 ${c.amount} × ${c.people} 人` : '总价'}>
                          💴 {c.title}：{cashMoney(c)}
                          {c.perPerson ? `（${c.amount}×${c.people}人）` : ''}
                        </span>
                      ))}
                    </div>
                    {a.place && <div className="act-place">📍 {a.place}</div>}
                    {a.notes && <div className="act-notes"><SensitiveText text={a.notes} /></div>}
                  </div>
                  <div className="act-side">
                    {a.cost > 0 && <span className="act-cost">{yuan(a.cost)}</span>}
                    {canEdit && (
                      <div className="act-ops">
                        <button className="btn sm ghost" onClick={() => setEditing(a)}>修改</button>
                        <button className="btn sm ghost" style={{ color: 'var(--red)' }} onClick={() => removeAct(a)}>删除</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {canEdit && (
                <div style={{ padding: '8px 14px' }}>
                  <button className="btn sm ghost" onClick={() => setAddingToDay(day)}>＋ 在这一天添加</button>
                </div>
              )}
            </div>
          </details>
        );
      })}

      {addingToDay && (
        <ActivityModal
          tripId={bundle.trip.id}
          day={addingToDay}
          days={days}
          members={members}
          onClose={() => setAddingToDay(null)}
          onSaved={() => { setAddingToDay(null); reload(); }}
        />
      )}
      {editing && (
        <ActivityModal
          tripId={bundle.trip.id}
          activity={editing}
          days={days}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {aiOpen && <AiPanel bundle={bundle} reload={reload} onClose={() => setAiOpen(false)} />}
      {/* TripMode 组件尚未迁移到新类型（仍按旧 TripBundle 建模），运行时字段兼容，先收窄传参 */}
      {tripMode && <TripMode bundle={bundle as any} weather={weather as any} onClose={() => setTripMode(false)} />}
    </div>
  );
}

/* ---------------- 添加/编辑行程 ---------------- */

function ActivityModal({ tripId, day, days, members, activity, onClose, onSaved }: {
  tripId: string;
  day?: TripDay;
  days: TripDay[];
  members: { id: string; displayName: string }[];
  activity?: Activity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [dayId, setDayId] = useState<string>(activity?.dayId ?? day?.id ?? days[0]?.id ?? '');
  const [time, setTime] = useState(activity?.time || '');
  const [endTime, setEndTime] = useState(activity?.endTime || '');
  const [kind, setKind] = useState<ActivityKind>(activity?.kind || 'sight');
  const [title, setTitle] = useState(activity?.title || '');
  const [place, setPlace] = useState(activity?.place || '');
  const [cost, setCost] = useState(activity?.cost ? String(activity.cost) : '');
  const [notes, setNotes] = useState(activity?.notes || '');
  const [status, setStatus] = useState<any>(activity?.status || null);
  const [assigneeId, setAssigneeId] = useState(activity?.assigneeMemberId || '');
  const [busy, setBusy] = useState(false);

  const pickPoi = (name: string, lat: number, lng: number) => {
    setTitle(title || name);
    setPlace(name);
    // 经由 notes 记录坐标，保存时带上
    (window as any).__pickedPoi = { lat, lng };
  };

  const save = async () => {
    if (busy) return;
    if (!title.trim()) { toast('写一下要做什么吧', true); return; }
    if (time && endTime && endTime < time) { toast('结束时间不能早于开始时间', true); return; }
    setBusy(true);
    const me = members[0]?.displayName || '我';
    const poi = (window as any).__pickedPoi;
    const body = {
      time: time || null,
      endTime: endTime || null,
      kind,
      title: title.trim(),
      place: place.trim(),
      cost: Number(cost) || 0,
      notes: notes.trim(),
      status,
      assigneeMemberId: assigneeId || null,
      lat: activity?.lat ?? poi?.lat ?? null,
      lng: activity?.lng ?? poi?.lng ?? null,
    };
    try {
      if (activity) {
        await updateActivity(tripId, activity.id, { ...body, dayId }, me);
        toast('行程已更新');
      } else {
        await createActivity(tripId, dayId, body, me);
        toast('已添加行程');
      }
      (window as any).__pickedPoi = null;
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={activity ? '修改行程' : `添加行程 · ${day ? fmtDate(day.date) : ''}`} onClose={onClose} width={520}>
      <div className="field">
        <label>哪一天</label>
        <select className="input" value={dayId} onChange={e => setDayId(e.target.value)}>
          {days.map(d => <option key={d.id} value={d.id}>第 {d.dayNumber} 天 · {d.date}{d.title ? ` · ${d.title}` : ''}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>开始时间</label>
          <input className="input" type="time" value={time || ''} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label>结束时间</label>
          <input className="input" type="time" value={endTime || ''} onChange={e => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>类型</label>
        <div className="row-ops">
          {Object.entries(KIND_META).map(([k, m]) => (
            <button key={k} type="button" className={`btn sm ${kind === k ? 'primary' : 'ghost'}`} onClick={() => setKind(k as ActivityKind)}>{m.icon} {m.label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>做什么</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：洱海环湖骑行" maxLength={100} />
      </div>
      <div className="field">
        <label>地点（可搜索定位）</label>
        <input className="input" value={place} onChange={e => setPlace(e.target.value)} placeholder="地点名称，保存后显示在地图上" maxLength={60} />
        <PoiSearch defaultCity={days.find(d => d.id === dayId)?.place || ''} onPick={pickPoi} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>预估费用（元）</label>
          <input className="input" type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>负责人</label>
          <select className="input" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
            <option value="">不指定</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>确认状态</label>
        <StatusPicker value={status} canEdit onChange={setStatus} />
      </div>
      <div className="field">
        <label>备注</label>
        <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="补充信息（证件号/订单号/房间号会自动隐藏）" />
      </div>
      <div className="modal-ops">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
      </div>
    </Modal>
  );
}

/* ---------------- AI 助手面板 ---------------- */

function AiPanel({ bundle, reload, onClose }: { bundle: TabCtx['bundle']; reload: () => void; onClose: () => void }) {
  const { toast } = useApp();
  const [mode, setMode] = useState<'generate' | 'parse'>('generate');
  const [city, setCity] = useState(bundle.trip.destination.split(/[→,，\s]+/)[0] || '');
  const [dayCount, setDayCount] = useState(String(Math.max(1, bundle.days.length || 3)));
  const [pace, setPace] = useState('适中');
  const [interests, setInterests] = useState<string[]>([]);
  const [guideText, setGuideText] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const INTERESTS = ['美食', '自然', '人文', '亲子', '购物', '夜生活'];

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setPreview(null);
    try {
      let guide: any;
      if (mode === 'generate') {
        if (!city.trim()) { toast('请填写目的地', true); setBusy(false); return; }
        guide = await proxy.post('/api/ai/generate', {
          city: city.trim(), days: Number(dayCount) || 3, pace, interests,
        });
      } else {
        if (!guideText.trim()) { toast('请粘贴攻略文本', true); setBusy(false); return; }
        guide = await proxy.post('/api/ai/parse-guide', { text: guideText });
      }
      setPreview(guide);
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成失败', true);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (mode: 'append' | 'replaceAll' | 'targeted') => {
    if (!preview || busy) return;
    setBusy(true);
    const me = bundle.members[0]?.displayName || '我';
    try {
      const r = await applyGuideToTrip(
        bundle.trip.id,
        preview,
        { targeted: mode === 'targeted', tripStartDate: bundle.trip.startDate },
        me,
      );
      const dayLabel = mode === 'targeted' && r.replacedDays.length
        ? `已重新生成第 ${r.replacedDays.join('、')} 天行程`
        : `已写入 ${preview.days.length} 天行程`;
      toast(`${dayLabel}${r.activityCount ? `，共 ${r.activityCount} 项安排` : ''}${mode === 'replaceAll' ? '（已覆盖原行程）' : mode === 'append' ? '（行程已按天重建）' : '（其余天保持不变）'}`);
      reload();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '写入失败', true);
    } finally {
      setBusy(false);
    }
  };

  // 解析出的天号与当前行程的可定位性（用于「只替换这几天」）
  const dayNums = preview ? [...new Set<number>(preview.days.map((d: any) => Math.round(Number(d.dayNumber))))].sort((a, b) => a - b) : [];
  const maxTripDay = bundle.days.reduce((m, d) => Math.max(m, d.dayNumber), 0);
  const targetable = mode === 'parse' && dayNums.length > 0 && maxTripDay > 0 && dayNums.every((n: number) => n >= 1 && n <= maxTripDay);

  return (
    <Modal title="✨ AI 行程助手" onClose={onClose} width={560}>
      <div className="auth-tabs" style={{ marginBottom: 14 }}>
        <button className={mode === 'generate' ? 'on' : ''} onClick={() => { setMode('generate'); setPreview(null); }}>生成新行程</button>
        <button className={mode === 'parse' ? 'on' : ''} onClick={() => { setMode('parse'); setPreview(null); }}>解析攻略文本</button>
      </div>

      {mode === 'generate' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div className="field">
              <label>目的地</label>
              <input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="例如：成都" />
            </div>
            <div className="field">
              <label>天数</label>
              <input className="input" type="number" min={1} max={15} value={dayCount} onChange={e => setDayCount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>节奏</label>
            <div className="row-ops">
              {['轻松', '适中', '充实'].map(p => (
                <button key={p} className={`btn sm ${pace === p ? 'primary' : 'ghost'}`} onClick={() => setPace(p)}>{p}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>偏好（可多选）</label>
            <div className="row-ops">
              {INTERESTS.map(i => (
                <button key={i} className={`chip ${interests.includes(i) ? 'on' : ''}`}
                  onClick={() => setInterests(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])}>{i}</button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <label>粘贴攻略（支持 Day N / 第 N 天 / D5：10月5日：路线）</label>
          <textarea className="input" rows={7} value={guideText} onChange={e => setGuideText(e.target.value)}
            placeholder={'Day 1: 抵达大理，古城漫步\nDay 2: 洱海环湖骑行，喜洲午餐\nD5：10月5日：室韦-驯鹿公园-额尔古纳湿地-海拉尔\n（只粘贴要重写的那几天即可，可精准替换对应天）'} />
        </div>
      )}

      <div className="modal-ops" style={{ justifyContent: 'space-between' }}>
        <span className="muted">
          {preview
            ? mode === 'parse' && dayNums.length
              ? `识别到第 ${dayNums.join('、')} 天行程（${preview.source === 'ai' ? 'AI 解析' : '内置模板'}）`
              : `识别到 ${preview.days.length} 天行程（${preview.source === 'ai' ? 'AI 生成' : '内置模板'}）`
            : '未配置 AI 时自动使用内置规则，仍可生成合理框架'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={run} disabled={busy}>{mode === 'generate' ? '生成预览' : '解析预览'}</button>
          {busy && (
            <div className="ai-progress" role="status">
              {elapsed < 15
                ? 'AI 正在规划，一般需要 20~60 秒，可先喝口水 ☕'
                : elapsed < 60
                  ? `已等待 ${elapsed} 秒，正在细化每日安排…`
                  : `已等待 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒，复杂行程生成较慢，请再稍候…`}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <>
          <div className="divider" />
          <div style={{ maxHeight: 240, overflow: 'auto', fontSize: 13.5, lineHeight: 1.7 }}>
            {preview.days.map((d: any) => (
              <div key={d.dayNumber} style={{ marginBottom: 8 }}>
                <b style={{ color: 'var(--green-deep)' }}>第 {d.dayNumber} 天{d.date ? `（${d.date}）` : ''}{d.title ? ` · ${d.title}` : ''}{d.place ? `（${d.place}）` : ''}</b>
                <div style={{ color: 'var(--ink-soft)' }}>
                  {(d.activities || []).map((a: any, i: number) => (
                    <span key={i}>{a.time ? `${a.time} ` : ''}{a.title}{i < d.activities.length - 1 ? ' → ' : ''}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-ops">
            <button className="btn" onClick={() => apply('append')} disabled={busy}>追加到行程</button>
            {targetable && (
              <button className="btn primary" onClick={() => apply('targeted')} disabled={busy}>
                只替换第 {dayNums.join('、')} 天
              </button>
            )}
            <button className="btn danger" onClick={() => apply('replaceAll')} disabled={busy}>覆盖现有行程</button>
          </div>
          {mode === 'parse' && !targetable && dayNums.length > 0 && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              {maxTripDay > 0
                ? `提示：识别的天号（第 ${dayNums.join('、')} 天）需在当前行程的 1~${maxTripDay} 天范围内才能精准替换`
                : '提示：当前行程还没有任何天，可先「覆盖现有行程」或「追加到行程」'}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
