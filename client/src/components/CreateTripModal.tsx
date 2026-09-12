import { useState } from 'react';
import { api, type TripCardInfo } from '../api';
import { useApp } from '../store';
import { Modal } from './ui';

const EMOJIS = ['🧭', '⛰️', '🏝️', '🏖️', '🏮', '🏯', '🎡', '🚄', '✈️', '🚗', '⛺', '🏂', '🍜', '🥾'];
const COLORS = ['#2f6e4f', '#b5543b', '#3b6ea5', '#c9a04e', '#7d5ba6', '#a0433b'];

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 创建旅程；传入 trip 时进入编辑模式（预填并调用 PATCH，无粘贴攻略区） */
export default function CreateTripModal({ trip, onClose, onCreated, onSaved }: {
  trip?: TripCardInfo;
  onClose: () => void;
  onCreated?: (id: number) => void;
  onSaved?: () => void;
}) {
  const editing = Boolean(trip);
  const { toast } = useApp();
  const [title, setTitle] = useState(trip?.title || '');
  const [destination, setDestination] = useState(trip?.destination || '');
  const [startDate, setStartDate] = useState(trip?.startDate || plusDays(7));
  const [endDate, setEndDate] = useState(trip?.endDate || plusDays(10));
  const [budget, setBudget] = useState(trip?.budget ? String(trip.budget) : '');
  const [emoji, setEmoji] = useState(trip?.coverEmoji || '🧭');
  const [color, setColor] = useState(trip?.coverColor || COLORS[0]);
  const [guideText, setGuideText] = useState('');
  const [busy, setBusy] = useState<'' | 'creating' | 'parsing' | 'saving'>('');

  const create = async () => {
    if (busy) return;
    if (!title.trim()) { toast('给旅程起个名字吧', true); return; }
    if (endDate < startDate) { toast('结束日期不能早于开始日期', true); return; }
    setBusy('creating');
    try {
      const r = await api.post<{ id: number }>('/api/trips', {
        title: title.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        budget: Number(budget) || 0,
        coverEmoji: emoji,
        coverColor: color,
      });
      if (guideText.trim()) {
        setBusy('parsing');
        try {
          const guide = await api.post<any>(`/api/trips/${r.id}/ai/parse-guide`, { text: guideText });
          await api.post(`/api/trips/${r.id}/ai/apply`, { guide, replaceDays: true });
          toast(`创建成功，AI 识别出 ${guide.days.length} 天行程（${guide.source === 'ai' ? 'AI 解析' : '智能模板解析'}）`);
        } catch {
          toast('创建成功，但攻略解析失败，可稍后在行程页重试', true);
        }
      } else {
        toast('旅程已创建');
      }
      onCreated?.(r.id);
    } catch (e: any) {
      toast(e.message || '创建失败', true);
      setBusy('');
    }
  };

  const save = async () => {
    if (!trip || busy) return;
    if (!title.trim()) { toast('给旅程起个名字吧', true); return; }
    if (endDate < startDate) { toast('结束日期不能早于开始日期', true); return; }
    setBusy('saving');
    try {
      await api.patch(`/api/trips/${trip.id}`, {
        title: title.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        budget: Number(budget) || 0,
        coverEmoji: emoji,
        coverColor: color,
      });
      toast('旅程已更新');
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast(e.message || '保存失败', true);
      setBusy('');
    }
  };

  return (
    <Modal title={editing ? '编辑旅程' : '创建一段新旅程'} onClose={onClose} width={500}>
      <div className="field">
        <label>旅程名称</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：云南大理丽江 6 日慢游" maxLength={60} />
      </div>
      <div className="field">
        <label>目的地</label>
        <input className="input" value={destination} onChange={e => setDestination(e.target.value)} placeholder="城市或地区，例如：大理 → 丽江" maxLength={60} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>出发日期</label>
          <input className="input" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
        </div>
        <div className="field">
          <label>结束日期</label>
          <input className="input" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="field">
          <label>预算（元）</label>
          <input className="input" type="number" min={0} value={budget} onChange={e => setBudget(e.target.value)} placeholder="选填" />
        </div>
      </div>
      <div className="field">
        <label>封面</label>
        <div className="row-ops">
          {EMOJIS.map(e => (
            <button key={e} type="button" className={`btn sm ${emoji === e ? 'primary' : 'ghost'}`} style={{ fontSize: 17 }} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
        <div className="row-ops" style={{ marginTop: 6 }}>
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ink)' : '1px solid var(--line-strong)' }} />
          ))}
        </div>
      </div>
      {editing ? (
        <>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            修改出发/结束日期后，每日行程会自动按新日期对齐；天数变化时多余的天会保留内容并排在末尾。
          </p>
          <div className="modal-ops">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={save} disabled={busy !== ''}>
              {busy === 'saving' ? '保存中…' : '保存修改'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 4, marginTop: 4 }}>
            <label>粘贴攻略（可选）</label>
            <textarea className="input" value={guideText} onChange={e => setGuideText(e.target.value)} rows={5}
              placeholder={'支持「Day 1: …」「第 1 天：…」或「D5：10月5日：…」格式，粘贴后自动解析成每日行程。'} />
            <span className="muted">创建时将调用 AI 智能识别；未配置 AI Key 时使用内置规则解析，同样可用。</span>
          </div>
          <div className="modal-ops">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={create} disabled={busy !== ''}>
              {busy === 'creating' ? '创建中…' : busy === 'parsing' ? 'AI 解析攻略中…' : '创建旅程'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
