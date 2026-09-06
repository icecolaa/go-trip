import { useMemo, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal, KIND_META, fmtDate, weekOf, yuan } from '../../components/ui';
import type { TabCtx } from './tabCtx';
import type { Activity, TripDay } from '@shared/types';
import PoiSearch from '../../components/PoiSearch';

export default function ItineraryTab({ bundle, reload, weather, canEdit }: TabCtx) {
  const { toast } = useApp();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [addingToDay, setAddingToDay] = useState<TripDay | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);

  const { days, activities, members } = bundle;
  const actsByDay = useMemo(() => {
    const map = new Map<number, Activity[]>();
    for (const d of days) map.set(d.id, []);
    for (const a of activities) {
      if (!map.has(a.dayId)) map.set(a.dayId, []);
      map.get(a.dayId)!.push(a);
    }
    for (const list of map.values()) list.sort((x, y) => x.sort - y.sort || x.id - y.id);
    return map;
  }, [days, activities]);

  const weatherByDate = useMemo(() => new Map(weather.map(w => [w.date, w])), [weather]);

  /* 拖拽排序：放下后按新顺序提交 */
  const onDrop = async (targetDayId: number, beforeIndex: number) => {
    if (dragId == null) return;
    const dragged = activities.find(a => a.id === dragId);
    setDragId(null);
    if (!dragged) return;
    // 构造新序列
    const targetList = [...(actsByDay.get(targetDayId) || [])].filter(a => a.id !== dragId);
    const item = { id: dragged.id, dayId: targetDayId };
    targetList.splice(beforeIndex, 0, item as Activity);
    const items = targetList.map((a, i) => ({ id: a.id, dayId: targetDayId, sort: i }));
    try {
      await api.post(`/api/trips/${bundle.trip.id}/activities/reorder`, { items });
      reload();
    } catch (e: any) {
      toast(e.message || '排序失败', true);
    }
  };

  const removeAct = async (a: Activity) => {
    if (!confirm(`删除「${a.title}」？`)) return;
    try {
      await api.del(`/api/activities/${a.id}`);
      toast('已删除');
      reload();
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  return (
    <div>
      <div className="row-ops" style={{ marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0, flex: 1 }}>每日行程</h2>
        {canEdit && (
          <>
            <button className="btn sm" onClick={() => setAiOpen(true)}>✨ AI 助手</button>
            <button className="btn sm primary" onClick={() => setAddingToDay(days[0] || null)} disabled={!days.length}>＋ 添加行程</button>
          </>
        )}
      </div>

      {days.length === 0 && <div className="card empty"><span className="big">🗓️</span>还没有行程日，点击「AI 助手」一键生成，或在旅程设置里调整日期。</div>}

      {days.map(day => {
        const acts = actsByDay.get(day.id) || [];
        const w = weatherByDate.get(day.date);
        return (
          <div className="day-block" key={day.id}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(day.id, acts.length)}>
            <div className="day-head">
              <div className="day-num">
                <span className="n">D{day.dayNumber}</span>
                <span className="w">{weekOf(day.date)}</span>
              </div>
              <div className="info">
                <div className="t">{fmtDate(day.date)}{day.title ? ` · ${day.title}` : ''}</div>
                <div className="p">📍 {day.place || '待定'} · {acts.length} 项安排</div>
              </div>
              {w && w.tempMax != null && (
                <div className="day-weather" title={w.label}>
                  <span style={{ fontSize: 16 }}>{w.icon}</span>
                  <span>{w.label}</span>
                  <b>{w.tempMax}° / {w.tempMin}°</b>
                </div>
              )}
            </div>
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
                  <span className="act-time">{a.time || '待定'}</span>
                  <span className={`act-icon kind-${a.kind}`}>{KIND_META[a.kind]?.icon || '📌'}</span>
                  <div className="act-main">
                    <div className="act-title">
                      {a.title}
                      {a.assigneeId != null && (() => {
                        const m = members.find(m => m.id === a.assigneeId);
                        return m ? <span className="tag gray">{m.displayName}负责</span> : null;
                      })()}
                    </div>
                    {a.place && <div className="act-place">📍 {a.place}</div>}
                    {a.notes && <div className="act-notes">{a.notes}</div>}
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
          </div>
        );
      })}

      {addingToDay && (
        <ActivityModal
          day={addingToDay}
          days={days}
          members={members}
          onClose={() => setAddingToDay(null)}
          onSaved={() => { setAddingToDay(null); reload(); }}
        />
      )}
      {editing && (
        <ActivityModal
          activity={editing}
          days={days}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {aiOpen && <AiPanel bundle={bundle} reload={reload} onClose={() => setAiOpen(false)} />}
    </div>
  );
}

/* ---------------- 添加/编辑行程 ---------------- */

function ActivityModal({ day, days, members, activity, onClose, onSaved }: {
  day?: TripDay;
  days: TripDay[];
  members: { id: number; displayName: string }[];
  activity?: Activity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [dayId, setDayId] = useState(activity?.dayId ?? day?.id ?? days[0]?.id ?? 0);
  const [time, setTime] = useState(activity?.time || '');
  const [kind, setKind] = useState<string>(activity?.kind || 'sight');
  const [title, setTitle] = useState(activity?.title || '');
  const [place, setPlace] = useState(activity?.place || '');
  const [cost, setCost] = useState(activity?.cost ? String(activity.cost) : '');
  const [notes, setNotes] = useState(activity?.notes || '');
  const [assigneeId, setAssigneeId] = useState(activity?.assigneeId?.toString() || '');
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
    setBusy(true);
    const poi = (window as any).__pickedPoi;
    const payload = {
      dayId: Number(dayId),
      time: time || null,
      kind,
      title: title.trim(),
      place: place.trim(),
      cost: Number(cost) || 0,
      notes: notes.trim(),
      assigneeId: assigneeId ? Number(assigneeId) : null,
      lat: activity?.lat ?? poi?.lat ?? null,
      lng: activity?.lng ?? poi?.lng ?? null,
    };
    try {
      if (activity) {
        await api.patch(`/api/activities/${activity.id}`, payload);
        toast('行程已更新');
      } else {
        await api.post(`/api/days/${dayId}/activities`, payload);
        toast('已添加行程');
      }
      (window as any).__pickedPoi = null;
      onSaved();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={activity ? '修改行程' : `添加行程 · ${day ? fmtDate(day.date) : ''}`} onClose={onClose} width={520}>
      <div className="field">
        <label>哪一天</label>
        <select className="input" value={dayId} onChange={e => setDayId(Number(e.target.value))}>
          {days.map(d => <option key={d.id} value={d.id}>第 {d.dayNumber} 天 · {d.date}{d.title ? ` · ${d.title}` : ''}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
        <div className="field">
          <label>时间</label>
          <input className="input" type="time" value={time || ''} onChange={e => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label>类型</label>
          <div className="row-ops">
            {Object.entries(KIND_META).map(([k, m]) => (
              <button key={k} type="button" className={`btn sm ${kind === k ? 'primary' : 'ghost'}`} onClick={() => setKind(k)}>{m.icon} {m.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label>做什么</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：洱海环湖骑行" maxLength={100} />
      </div>
      <div className="field">
        <label>地点（可搜索定位）</label>
        <input className="input" value={place} onChange={e => setPlace(e.target.value)} placeholder="地点名称，保存后显示在地图上" maxLength={60} />
        <PoiSearch defaultCity={days.find(d => d.id === Number(dayId))?.place || ''} onPick={pickPoi} />
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
        <label>备注</label>
        <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="开放时间、交通方式、注意事项…" maxLength={300} />
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

  const INTERESTS = ['美食', '自然', '人文', '亲子', '购物', '夜生活'];

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setPreview(null);
    try {
      let guide: any;
      if (mode === 'generate') {
        if (!city.trim()) { toast('请填写目的地', true); setBusy(false); return; }
        guide = await api.post(`/api/trips/${bundle.trip.id}/ai/generate`, {
          city: city.trim(), days: Number(dayCount) || 3, pace, interests,
        });
      } else {
        if (!guideText.trim()) { toast('请粘贴攻略文本', true); setBusy(false); return; }
        guide = await api.post(`/api/trips/${bundle.trip.id}/ai/parse-guide`, { text: guideText });
      }
      setPreview(guide);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (replaceDays: boolean) => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/trips/${bundle.trip.id}/ai/apply`, { guide: preview, replaceDays });
      toast(`已写入 ${preview.days.length} 天行程${replaceDays ? '（已覆盖原行程）' : '（追加在行程后面）'}`);
      reload();
      onClose();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

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
          <label>粘贴攻略（支持 Day N / 第 N 天）</label>
          <textarea className="input" rows={7} value={guideText} onChange={e => setGuideText(e.target.value)}
            placeholder={'Day 1: 抵达大理，古城漫步\nDay 2: 洱海环湖骑行，喜洲午餐\nDay 3-4: 丽江古城、玉龙雪山'} />
        </div>
      )}

      <div className="modal-ops" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{preview ? `识别到 ${preview.days.length} 天行程（${preview.source === 'ai' ? 'AI 生成' : '内置模板'}）` : '未配置 AI 时自动使用内置规则，仍可生成合理框架'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={run} disabled={busy}>{busy ? 'AI 思考中…' : mode === 'generate' ? '生成预览' : '解析预览'}</button>
        </div>
      </div>

      {preview && (
        <>
          <div className="divider" />
          <div style={{ maxHeight: 240, overflow: 'auto', fontSize: 13.5, lineHeight: 1.7 }}>
            {preview.days.map((d: any) => (
              <div key={d.dayNumber} style={{ marginBottom: 8 }}>
                <b style={{ color: 'var(--green-deep)' }}>第 {d.dayNumber} 天{d.title ? ` · ${d.title}` : ''}{d.place ? `（${d.place}）` : ''}</b>
                <div style={{ color: 'var(--ink-soft)' }}>
                  {(d.activities || []).map((a: any, i: number) => (
                    <span key={i}>{a.time ? `${a.time} ` : ''}{a.title}{i < d.activities.length - 1 ? ' → ' : ''}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-ops">
            <button className="btn" onClick={() => apply(false)} disabled={busy}>追加到行程</button>
            <button className="btn danger" onClick={() => apply(true)} disabled={busy}>覆盖现有行程</button>
          </div>
        </>
      )}
    </Modal>
  );
}
