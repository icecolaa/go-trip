import { useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Modal, Avatar, timeAgo, fmtDate } from '../../components/ui';
import type { TabCtx } from './tabCtx';

const MOODS = ['🎉', '🥰', '😎', '😴', '🤯', '🌧️', '🍜', '📝'];

export default function JournalTab({ bundle, reload, canEdit }: TabCtx) {
  const { toast } = useApp();
  const { journal, days, members } = bundle;
  const me = members.find(m => m.id === bundle.myMemberId);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('📝');
  const [dayId, setDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; content: string; mood: string } | null>(null);

  const publish = async () => {
    if (!content.trim() || busy) { toast('写点什么再发布吧', true); return; }
    setBusy(true);
    try {
      await api.post(`/api/trips/${bundle.trip.id}/journal`, {
        content: content.trim(), mood, dayId: dayId ? Number(dayId) : null,
      });
      setContent('');
      toast('日志已发布 📝');
      reload();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm('删除这条日志？')) return;
    try {
      await api.del(`/api/journal/${id}`);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.patch(`/api/journal/${editing.id}`, { content: editing.content, mood: editing.mood });
      setEditing(null);
      reload();
    } catch (e: any) { toast(e.message, true); }
  };

  return (
    <div>
      <h2 className="section-title">旅行日志</h2>

      {canEdit && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Avatar name={me?.displayName || '我'} color={me?.avatarColor || '#2f6e4f'} />
            <div style={{ flex: 1 }}>
              <textarea className="input" rows={3} value={content} onChange={e => setContent(e.target.value)}
                placeholder={'记录这一刻：出发前的期待、路上的见闻、踩过的坑…'} maxLength={3000} />
              <div className="row-ops" style={{ marginTop: 10 }}>
                <span className="muted">心情</span>
                {MOODS.map(m => (
                  <button key={m} className={`btn sm ghost ${mood === m ? 'primary' : ''}`} style={{ fontSize: 16 }} onClick={() => setMood(m)}>{m}</button>
                ))}
                <select className="input" style={{ width: 150, marginLeft: 'auto' }} value={dayId} onChange={e => setDayId(e.target.value)}>
                  <option value="">不关联具体某天</option>
                  {days.map(d => <option key={d.id} value={d.id}>第 {d.dayNumber} 天 · {fmtDate(d.date)}</option>)}
                </select>
                <button className="btn primary sm" onClick={publish} disabled={busy}>{busy ? '发布中…' : '发布日志'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {journal.length === 0 ? (
        <div className="card empty"><span className="big">✍️</span>还没有日志<br />旅途中的高光时刻值得被记下来</div>
      ) : (
        journal.map(j => {
          const author = members.find(m => m.id === j.authorMemberId);
          const day = days.find(d => d.id === j.dayId);
          const mine = j.authorMemberId === bundle.myMemberId;
          return (
            <div className="card journal-card" key={j.id}>
              <div className="journal-head">
                <Avatar name={j.author?.nickname || '旅'} color={j.author?.avatarColor || '#2f6e4f'} size="sm" />
                <b style={{ fontSize: 14 }}>{j.author?.nickname || '旅伴'}</b>
                <span className="journal-mood">{j.mood}</span>
                <div style={{ flex: 1 }} />
                {mine && canEdit && (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing({ id: j.id, content: j.content, mood: j.mood })}>编辑</button>
                    <button className="btn sm ghost" style={{ color: 'var(--red)' }} onClick={() => del(j.id)}>删除</button>
                  </>
                )}
              </div>
              <div className="journal-body">{j.content}</div>
              <div className="journal-foot">
                <span>{timeAgo(j.createdAt)}</span>
                {day && <span>· 第 {day.dayNumber} 天</span>}
              </div>
            </div>
          );
        })
      )}

      {editing && (
        <Modal title="编辑日志" onClose={() => setEditing(null)} width={480}>
          <div className="row-ops" style={{ marginBottom: 10 }}>
            {MOODS.map(m => (
              <button key={m} className={`btn sm ghost ${editing.mood === m ? 'primary' : ''}`} style={{ fontSize: 16 }} onClick={() => setEditing({ ...editing, mood: m })}>{m}</button>
            ))}
          </div>
          <textarea className="input" rows={5} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} />
          <div className="modal-ops">
            <button className="btn" onClick={() => setEditing(null)}>取消</button>
            <button className="btn primary" onClick={saveEdit}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
