import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTrips } from '../rdb/trip';
import { tempUrls } from '../rdb/storage';
import { seedDemoTrip } from '../rdb/seed';
import { rememberTrip } from '../components/Sidebar';
import type { TripCardInfo } from '../types';
import { useApp } from '../store';
import { Avatar, Modal, countdownText, yuan } from '../components/ui';
import CreateTripModal from '../components/CreateTripModal';
import UsageGuideModal from '../components/UsageGuideModal';

type Filter = 'all' | 'mine' | 'upcoming';

export default function DashboardPage() {
  const { me } = useApp();
  const nav = useNavigate();
  const [trips, setTrips] = useState<TripCardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TripCardInfo | null>(null);
  const [importing, setImporting] = useState(false);

  const importDemo = async () => {
    if (importing) return;
    setImporting(true);
    try {
      await seedDemoTrip(me?.nickname || '我');
      load();
    } finally {
      setImporting(false);
    }
  };
  const [guideOpen, setGuideOpen] = useState(false);

  const load = () => {
    setLoading(true);
    listTrips()
      .then(setTrips)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const shown = useMemo(() => {
    if (filter === 'mine') return trips; // 单主人架构：列表即自己发起的
    if (filter === 'upcoming') return trips.filter(t => countdownText(t) !== '已结束');
    return trips;
  }, [trips, filter]);

  const upcoming = trips.filter(t => countdownText(t) !== '已结束').length;

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <h1>我的旅程</h1>
          <div className="sub">
            你好，{me?.nickname}！共 {trips.length} 段旅程{upcoming > 0 ? `，其中 ${upcoming} 段在路上等你` : ''}。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn lg" onClick={() => setGuideOpen(true)}>使用说明</button>
          <button className="btn primary lg" onClick={() => setCreating(true)}>＋ 创建旅程</button>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 18 }}>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>全部旅程</button>
        <button className={`chip ${filter === 'mine' ? 'on' : ''}`} onClick={() => setFilter('mine')}>我发起的</button>
        <button className={`chip ${filter === 'upcoming' ? 'on' : ''}`} onClick={() => setFilter('upcoming')}>即将出发</button>
      </div>

      {loading ? (
        <div className="trip-grid" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div className="card skel-card" key={i}>
              <div className="skel skel-cover" />
              <div className="skel skel-line w60" />
              <div className="skel skel-line w40" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <span className="big">🗺️</span>
          还没有旅程<br />点击右上角「创建旅程」开始规划
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={importDemo} disabled={importing}>{importing ? '导入中…' : '或导入演示行程看看'}</button>
          </div>
        </div>
      ) : (
        <div className="trip-grid">
          {shown.map(t => <TripCard key={t.id} t={t} onClick={() => { rememberTrip(t.id, t.title); nav(`/trip/${t.id}`); }} onEdit={() => setEditing(t)} />)}
        </div>
      )}

      {creating && (
        <CreateTripModal
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); rememberTrip(id); nav(`/trip/${id}`); }}
        />
      )}
      {editing && (
        <CreateTripModal
          trip={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {guideOpen && <UsageGuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function TripCard({ t, onClick, onEdit }: { t: TripCardInfo; onClick: () => void; onEdit: () => void }) {
  const cd = countdownText(t);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  useEffect(() => {
    setImgSrc('');
    if (t.coverImage && !t.coverImage.startsWith('data:')) {
      tempUrls([t.coverImage]).then(m => setImgSrc(m[t.coverImage!] || '')).catch(() => undefined);
    } else if (t.coverImage) setImgSrc(t.coverImage);
  }, [t.coverImage]);
  const showImg = !!imgSrc && !imgFailed;
  return (
    <div className="card trip-card" onClick={onClick}>
      {/* 有封面图时用图片底，否则退回封面色+图标（DESIGN.md：不做彩色整块底） */}
      <div className="trip-cover" style={{ ['--cover-accent' as string]: t.coverColor }}>
        {showImg && <img className="trip-cover-img" src={imgSrc} alt="" onError={() => setImgFailed(true)} loading="lazy" />}
        {!showImg && <span className="emoji">{t.coverEmoji}</span>}
        {(
          <button
            className="trip-edit-btn"
            title="编辑旅程"
            aria-label="编辑旅程"
            onClick={e => { e.stopPropagation(); onEdit(); }}
          >
            ✏️
          </button>
        )}
        <div className="cover-date">
          {t.startDate}<br />~ {t.endDate}
        </div>
      </div>
      <div className="trip-body">
        <div className="trip-title">{t.title}</div>
        <div className="trip-dest">📍 {t.destination || '目的地待定'}　·　{t.activityCount} 项安排　·　已花 {yuan(t.totalSpent)}</div>
        <div className="trip-meta">
          <div className="avatar-stack">
            {t.memberPreview.slice(0, 5).map((m, i) => (
              <Avatar key={i} name={m.displayName} color={m.avatarColor} size="sm" />
            ))}
          </div>
          <span className="countdown">{cd}</span>
        </div>
      </div>
    </div>
  );
}
