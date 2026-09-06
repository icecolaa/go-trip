import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, KIND_META, fmtDate, weekOf, yuan } from '../components/ui';
import type { Trip, TripDay, Activity } from '@shared/types';

interface ShareBundle {
  trip: Trip;
  days: TripDay[];
  activities: Activity[];
  members: { displayName: string; avatarColor: string; role: string }[];
}

export default function SharePage() {
  const { token } = useParams();
  const [data, setData] = useState<ShareBundle | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<ShareBundle>(`/api/share/${token}`).then(setData).catch(e => setErr(e.message));
  }, [token]);

  if (err) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h2 className="auth-title" style={{ fontSize: 22 }}>{err}</h2>
          <Link className="btn primary" to="/">回首页看看</Link>
        </div>
      </div>
    );
  }
  if (!data) return <div className="spin" style={{ marginTop: 120 }} />;

  const { trip, days, activities, members } = data;
  const actsByDay = new Map<number, Activity[]>();
  for (const d of days) actsByDay.set(d.id, []);
  for (const a of activities) actsByDay.get(a.dayId)?.push(a);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="card trip-hero">
        <div className="row1">
          <span className="emoji-big">{trip.coverEmoji}</span>
          <div>
            <h1>{trip.title}</h1>
            <div className="meta">
              <span>📍 {trip.destination || '目的地待定'}</span>
              <span>🗓️ {trip.startDate} ~ {trip.endDate}</span>
              <span>👥 {members.length} 位成员</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {members.map((m, i) => (
            <span key={i} className="row-ops" style={{ gap: 6 }}>
              <Avatar name={m.displayName} color={m.avatarColor} size="sm" />
              <span className="muted">{m.displayName}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '6px 12px', marginBottom: 16, textAlign: 'center' }}>
        <span className="muted">👀 只读分享页面 · 想一起编辑？<Link to={`/join-from-share`}>让发起人邀请你</Link></span>
      </div>

      {days.map(day => {
        const acts = actsByDay.get(day.id) || [];
        return (
          <div className="day-block" key={day.id}>
            <div className="day-head">
              <div className="day-num">
                <span className="n">D{day.dayNumber}</span>
                <span className="w">{weekOf(day.date)}</span>
              </div>
              <div className="info">
                <div className="t">{fmtDate(day.date)}{day.title ? ` · ${day.title}` : ''}</div>
                <div className="p">📍 {day.place || '待定'}</div>
              </div>
            </div>
            <div className="day-acts">
              {acts.length === 0 && <div className="empty" style={{ padding: 16 }}>自由活动 🛌</div>}
              {acts.map(a => (
                <div className="act-row" key={a.id}>
                  <span className="act-time">{a.time || '待定'}</span>
                  <span className={`act-icon kind-${a.kind}`}>{KIND_META[a.kind]?.icon || '📌'}</span>
                  <div className="act-main">
                    <div className="act-title">{a.title}</div>
                    {a.place && <div className="act-place">📍 {a.place}</div>}
                    {a.notes && <div className="act-notes">{a.notes}</div>}
                  </div>
                  {a.cost > 0 && <span className="act-cost">{yuan(a.cost)}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="muted" style={{ textAlign: 'center', marginTop: 20 }}>
        由 <Link to="/">出发吧 GoTrip</Link> 驱动 · 和朋友一起规划每一次出发
      </div>
    </div>
  );
}
