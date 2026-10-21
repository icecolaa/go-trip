import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTrips, deleteTrip } from '../rdb/trip';
import { tempUrls } from '../rdb/storage';
import { seedDemoTrip } from '../rdb/seed';
import { lastTripId, rememberTrip } from '../components/Sidebar';
import type { TripCardInfo } from '../types';
import { useApp } from '../store';
import { Avatar, countdownText, yuan } from '../components/ui';
import CreateTripModal from '../components/CreateTripModal';
import UsageGuideModal from '../components/UsageGuideModal';

type Filter = 'all' | 'mine' | 'upcoming';

/** 本地日期 YYYY-MM-DD（防 UTC 偏移） */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}
function shortDate(s: string): string {
  const [, m, d] = s.split('-');
  return `${Number(m)}.${Number(d)}`;
}
/** 行程阶段：进行中（第 N 天）/ 即将出发 / 已结束；开始日期未填不冒充进行中 */
function heroPhase(t: TripCardInfo): { label: string; cls: 'live' | 'up' | 'done' } {
  const today = localToday();
  if (!t.startDate) return { label: '日期待定', cls: 'up' };
  if (t.endDate && today > t.endDate) return { label: '已结束', cls: 'done' };
  if (today < t.startDate) return { label: '即将出发', cls: 'up' };
  return { label: `进行中 · 第 ${Math.max(1, daysBetween(t.startDate, today) + 1)} 天`, cls: 'live' };
}

export default function DashboardPage() {
  const { me, toast } = useApp();
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
    if (filter === 'upcoming') return trips.filter(t => t.startDate && countdownText(t) !== '已结束');
    return trips;
  }, [trips, filter]);

  const upcoming = trips.filter(t => t.startDate && countdownText(t) !== '已结束').length;

  /** 工作台当前行程（w2 稿 hero 面板）：最近打开的记忆优先，否则进行中的，否则最近的即将出发，否则第一条 */
  const currentTrip = useMemo(() => {
    if (!trips.length) return null;
    const last = lastTripId();
    const byMemory = last ? trips.find(t => t.id === last) : null;
    if (byMemory) return byMemory;
    const live = trips.find(t => heroPhase(t).cls === 'live');
    if (live) return live;
    // 无日期行程不是「即将出发」：不参与最近出发排序（空 startDate 排序恒最前），只作最后的兜底
    const nextUp = trips
      .filter(t => t.startDate && heroPhase(t).cls === 'up')
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return nextUp[0] || trips[0];
  }, [trips]);

  /** 删除行程：级联清 11 张子表（服务端 deleteTrip），清最近行程记忆后刷新列表 */
  const removeTrip = async (t: TripCardInfo) => {
    if (!window.confirm(`删除行程「${t.title}」？\n行程、安排、账目、清单、日志等全部数据将一并删除，不可恢复。`)) return;
    const el = document.querySelector<HTMLElement>(`[data-trip-id="${t.id}"]`);
    if (el) {
      el.style.transition = 'opacity 160ms var(--ease-out), transform 160ms var(--ease-out)';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.97)';
      await new Promise(r => setTimeout(r, 160));
    }
    try {
      await deleteTrip(t.id);
      try {
        if (localStorage.getItem('gotrip_last_trip') === t.id) {
          localStorage.removeItem('gotrip_last_trip');
          localStorage.removeItem('gotrip_last_trip_title');
        }
      } catch { /* ignore */ }
      toast('行程已删除');
      load();
    } catch (e: any) {
      // 退场动画已播：删除失败必须把卡片恢复回来，否则用户以为删了实际没删
      if (el) { el.style.opacity = ''; el.style.transform = ''; }
      toast(e instanceof Error ? e.message : '删除失败', true);
    }
  };

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <h1>我的旅程</h1>
          <div className="sub">
            你好，{me?.nickname}！共 {trips.length} 段旅程{upcoming > 0 ? `，其中 ${upcoming} 段在路上等你` : ''}。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn lg" onClick={() => setGuideOpen(true)}>使用说明</button>
          <button className="btn lg ghost" onClick={importDemo} disabled={importing} title="生成一段示例旅程（随时可删）">
            {importing ? '导入中…' : '导入演示行程'}
          </button>
          <button className="btn primary lg" onClick={() => setCreating(true)}>＋ 创建旅程</button>
        </div>
      </div>

      {currentTrip && (
        <DashHero
          t={currentTrip}
          onOpen={() => { rememberTrip(currentTrip.id, currentTrip.title); nav(`/trip/${currentTrip.id}`); }}
          onGo={tab => { rememberTrip(currentTrip.id, currentTrip.title); nav(`/trip/${currentTrip.id}?tab=${tab}`); }}
        />
      )}

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
          {shown.map(t => <TripCard key={t.id} t={t} onClick={() => { rememberTrip(t.id, t.title); nav(`/trip/${t.id}`); }} onEdit={() => setEditing(t)} onDelete={() => removeTrip(t)} />)}
        </div>
      )}

      {creating && (
        <CreateTripModal
          onClose={() => setCreating(false)}
          onCreated={(id, title) => { setCreating(false); rememberTrip(id, title); nav(`/trip/${id}`); }}
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

/** 当前旅程：封面与阶段信息 + 预算概况和规划入口。 */
function DashHero({ t, onOpen, onGo }: { t: TripCardInfo; onOpen: () => void; onGo: (tab: string) => void }) {
  const [imgSrc, setImgSrc] = useState('');
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setImgSrc('');
    setImgFailed(false);
    if (t.coverImage && !t.coverImage.startsWith('data:')) {
      tempUrls([t.coverImage]).then(m => { if (active) setImgSrc(m[t.coverImage!] || ''); }).catch(() => undefined);
    } else if (t.coverImage) setImgSrc(t.coverImage);
    return () => { active = false; };
  }, [t.coverImage]);
  const phase = heroPhase(t);
  const showImg = !!imgSrc && !imgFailed;
  const nights = Math.max(0, daysBetween(t.startDate, t.endDate));
  const budgetPct = t.budget > 0 ? Math.max(0, Math.round((t.totalSpent / t.budget) * 100)) : null;
  return (
    <section className="dash-current" aria-label="当前旅程" data-trip-hero={t.id}>
      <div className={`dash-hero ph-${phase.cls} ${showImg ? 'has-photo' : ''}`}>
      {showImg && (
        <img className="dash-hero-bg" src={imgSrc} alt="" onError={() => setImgFailed(true)} />
      )}
      {showImg && <div className="dash-hero-scrim" aria-hidden="true" />}
      <div className="dash-hero-in">
        <div className="row1">
          <span className="chip-live">{phase.label}</span>
          {!!t.startDate && !!t.endDate && (
            <span className="range-tag">{shortDate(t.startDate)} – {shortDate(t.endDate)} · {nights + 1}天{nights}晚</span>
          )}
        </div>
        <h2 className="ht-title">{t.title}</h2>
        <div className="ht-meta">
          <i className="ic ic-pin" />{t.destination || '目的地待定'}
          <span className="sep">|</span>
          <i className="ic ic-route" />已安排 {t.activityCount} 项
        </div>
        <div className="ht-foot">
          <button className="btn primary sm" onClick={onOpen}>继续规划</button>
        </div>
      </div>
      </div>
      <div className="dash-current-info">
        <div className="dash-current-heading"><h3>旅程概况</h3><span>{t.activityCount} 项安排</span></div>
        <div className="dash-current-money"><span>已花费</span><strong>{yuan(t.totalSpent)}</strong><span>{t.budget > 0 ? `预算 ${yuan(t.budget)}` : '尚未设置预算'}</span></div>
        {budgetPct != null && <>
          <div className="dash-budget-track" role="progressbar" aria-label="预算使用比例" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, budgetPct)} aria-valuetext={`预算已用 ${budgetPct}%`}><i style={{ width: `${Math.min(100, budgetPct)}%` }} /></div>
          <p className="dash-budget-caption">{t.totalSpent > t.budget ? `超出预算 ${yuan(t.totalSpent - t.budget)}` : `剩余预算 ${yuan(t.budget - t.totalSpent)}`} · 已用 {budgetPct}%</p>
        </>}
        <div className="dash-current-links" aria-label="旅程快捷入口">
          <button className="btn sm" onClick={() => onGo('itinerary')}>每日行程</button>
          <button className="btn sm" onClick={() => onGo('map')}>旅行地图</button>
          <button className="btn sm ghost" onClick={() => onGo('budget')}>团队预算 →</button>
        </div>
      </div>
    </section>
  );
}

function TripCard({ t, onClick, onEdit, onDelete }: { t: TripCardInfo; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const cd = countdownText(t);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  useEffect(() => {
    setImgSrc('');
    setImgFailed(false);
    if (t.coverImage && !t.coverImage.startsWith('data:')) {
      tempUrls([t.coverImage]).then(m => setImgSrc(m[t.coverImage!] || '')).catch(() => undefined);
    } else if (t.coverImage) setImgSrc(t.coverImage);
  }, [t.coverImage]);
  const showImg = !!imgSrc && !imgFailed;
  return (
    <div className="card trip-card" data-trip-id={t.id} onClick={onClick}>
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
        {(
          <button
            className="trip-del-btn"
            title="删除旅程（级联删除全部数据）"
            aria-label="删除旅程"
            onClick={e => { e.stopPropagation(); onDelete(); }}
          >
            🗑️
          </button>
        )}
        {/* 无日期行程不渲染日期角标：两侧为空时只剩一个孤立的「~」 */}
        {t.startDate && <div className="cover-date">{t.startDate}<br />~ {t.endDate}</div>}
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
