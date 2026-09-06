import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../store';
import { Avatar } from '../components/ui';

interface InviteInfo {
  trip: { id: number; title: string; destination: string; startDate: string; endDate: string; coverEmoji: string; coverColor: string };
  inviter: string;
  members: { displayName: string; avatarColor: string }[];
  memberCount: number;
}

export default function JoinPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const { me, toast } = useApp();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InviteInfo>(`/api/invites/${code}`).then(setInfo).catch(e => setErr(e.message));
  }, [code]);

  const join = async () => {
    if (!me) {
      nav(`/login?redirect=${encodeURIComponent(`/join/${code}`)}`);
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ tripId: number }>(`/api/invites/${code}/join`);
      toast('加入成功，出发吧！🎉');
      nav(`/trip/${r.tripId}`, { replace: true });
    } catch (e: any) {
      toast(e.message, true);
      setBusy(false);
    }
  };

  if (err) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}> :( </div>
          <h2 className="auth-title" style={{ fontSize: 22 }}>{err}</h2>
          <button className="btn primary" onClick={() => nav('/')}>回到首页</button>
        </div>
      </div>
    );
  }
  if (!info) return <div className="spin" style={{ marginTop: 120 }} />;

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ maxWidth: 460 }}>
        <div style={{
          height: 110, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 22px', background: `linear-gradient(135deg, ${info.trip.coverColor}, #1e4d35)`, color: '#fff',
        }}>
          <span style={{ fontSize: 46 }}>{info.trip.coverEmoji}</span>
          <div style={{ textAlign: 'right', fontSize: 12.5, opacity: .9 }}>
            {info.trip.startDate}<br />~ {info.trip.endDate}
          </div>
        </div>
        <h1 style={{ fontSize: 24, margin: '18px 0 4px', color: 'var(--green-deep)' }}>{info.trip.title}</h1>
        <p className="muted" style={{ margin: '0 0 14px' }}>📍 {info.trip.destination || '目的地待定'}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 20px' }}>
          <div className="avatar-stack">
            {info.members.slice(0, 6).map((m, i) => <Avatar key={i} name={m.displayName} color={m.avatarColor} size="sm" />)}
          </div>
          <span className="muted">{info.memberCount} 位成员已在路上</span>
        </div>
        <div className="card" style={{ padding: '10px 14px', marginBottom: 18, background: 'var(--card-warm)' }}>
          <b>{info.inviter}</b> 邀请你加入这段旅程，一起规划行程、记账分摊、打包行李。
        </div>
        <button className="btn primary lg" style={{ width: '100%' }} onClick={join} disabled={busy}>
          {busy ? '加入中…' : me ? '接受邀请，加入旅程' : '登录 / 注册后加入'}
        </button>
      </div>
    </div>
  );
}
