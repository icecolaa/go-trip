import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api, getToken, type TripBundle } from '../api';
import { useApp } from '../store';
import { Avatar, countdownText, tripProgress, yuan } from '../components/ui';
import ItineraryTab from './tabs/ItineraryTab';
import UsageGuideModal from '../components/UsageGuideModal';
import MapTab from './tabs/MapTab';
import BudgetTab from './tabs/BudgetTab';
import PackingTab from './tabs/PackingTab';
import JournalTab from './tabs/JournalTab';
import MembersTab from './tabs/MembersTab';
import ActivityTab from './tabs/ActivityTab';
import HandbookTab from './tabs/HandbookTab';
import LinksTab from './tabs/LinksTab';

const TABS = [
  { key: 'itinerary', label: '行程', ico: '🗓️' },
  { key: 'map', label: '地图', ico: '🗺️' },
  { key: 'budget', label: '预算', ico: '💰' },
  { key: 'packing', label: '清单', ico: '🎒' },
  { key: 'handbook', label: '锦囊', ico: '📖' },
  { key: 'links', label: '攻略', ico: '🔗' },
  { key: 'journal', label: '日志', ico: '✍️' },
  { key: 'members', label: '成员', ico: '👥' },
  { key: 'activity', label: '动态', ico: '📣' },
] as const;

export default function TripPage() {
  const { id } = useParams();
  const tripId = Number(id);
  const { toast } = useApp();
  const [bundle, setBundle] = useState<TripBundle | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'itinerary';
  const tab = TABS.some(t => t.key === rawTab) ? rawTab : 'itinerary';
  const [weather, setWeather] = useState<TripBundle['weather']>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const reloadTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const b = await api.get<TripBundle>(`/api/trips/${tripId}`);
      setBundle(b);
    } catch (e: any) {
      setLoadErr(e.message || '加载失败');
    }
  }, [tripId]);

  const loadWeather = useCallback(() => {
    api.get<TripBundle['weather']>(`/api/trips/${tripId}/weather`).then(setWeather).catch(() => {});
  }, [tripId]);

  useEffect(() => {
    load();
    loadWeather();
  }, [load, loadWeather]);

  // 实时协作：订阅房间 + 变更自动刷新
  useEffect(() => {
    if (!tripId) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${getToken()}`);
    let presence: number[] = [];
    const applyPresence = () => {
      setBundle(b => (b ? { ...b, onlineMemberIds: presence } : b));
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', tripId }));
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'presence' && msg.tripId === tripId) {
          presence = msg.onlineMemberIds;
          applyPresence();
        } else if (msg.type === 'change' && msg.tripId === tripId) {
          scheduleReload();
        } else if (msg.type === 'location' && msg.tripId === tripId) {
          scheduleReload();
        }
      } catch { /* ignore */ }
    };
    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"heartbeat"}');
    }, 15000);
    const scheduleReload = () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => load(), 500);
    };
    return () => {
      clearInterval(hb);
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      ws.close();
    };
  }, [tripId, load]);

  if (!bundle) {
    if (loadErr) {
      return (
        <div className="page">
          <div className="card empty">
            <span className="big">🚫</span>
            {loadErr}
            <br /><br />
            <Link className="btn" to="/">← 返回全部旅程</Link>
          </div>
        </div>
      );
    }
    return <div className="spin" />;
  }

  const { trip, members } = bundle;
  const onlineCount = bundle.onlineMemberIds.length;
  const canEdit = bundle.myRole === 'owner' || bundle.myRole === 'admin' || bundle.myRole === 'editor';
  const ctx = { bundle, reload: load, reloadWeather: loadWeather, weather, canEdit };

  return (
    <div className="page">
      {/* 旅程头部 */}
      <div className="card trip-hero">
        <div className="row1">
          <span className="emoji-big">{trip.coverEmoji}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1>{trip.title}</h1>
            <div className="meta">
              <span>📍 {trip.destination || '目的地待定'}</span>
              <span>🗓️ {trip.startDate} ~ {trip.endDate}</span>
              <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{countdownText(trip)}</span>
              {trip.budget > 0 && <span>💰 预算 {yuan(trip.budget)} · 已花 {yuan(bundle.budget.total)}</span>}
              {onlineCount > 0 && <span className="tag">🟢 {onlineCount} 人在线</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="avatar-stack">
              {members.slice(0, 6).map(m => (
                <span key={m.id} style={{ position: 'relative' }}>
                  <Avatar name={m.displayName} color={m.avatarColor} />
                  {m.userId && bundle.onlineMemberIds.includes(m.userId) && (
                    <span style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: '#47b56d', border: '2px solid var(--card)' }} />
                  )}
                </span>
              ))}
            </div>
            <button className="btn sm" onClick={() => setSearchParams({ tab: 'members' })}>管理成员</button>
          </div>
        </div>
        <div className="progress-line"><div style={{ width: `${tripProgress(trip)}%` }} /></div>
        <div className="muted" style={{ marginTop: 5 }}>旅程进度 {tripProgress(trip)}%{trip.description ? ` · ${trip.description}` : ''}</div>
      </div>

      <div className="trip-layout">
        {/* 侧边导航 */}
        <nav className="card trip-nav">
          {TABS.map(t => (
            <Link key={t.key} to={`?tab=${t.key}`} className={tab === t.key ? 'on' : ''}>
              <span className="ico">{t.ico}</span>{t.label}
            </Link>
          ))}
          <div style={{ marginTop: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="ug-nav-btn muted" style={{ fontSize: 12.5 }} onClick={() => setGuideOpen(true)}>📖 使用说明</button>
            <Link to="/" className="muted" style={{ fontSize: 12.5 }}>← 返回全部旅程</Link>
          </div>
        </nav>

        {/* 内容区 */}
        <div className="tab-pane" key={tab}>
          {tab === 'itinerary' && <ItineraryTab {...ctx} />}
          {tab === 'map' && <MapTab {...ctx} />}
          {tab === 'budget' && <BudgetTab {...ctx} />}
          {tab === 'packing' && <PackingTab {...ctx} />}
          {tab === 'handbook' && <HandbookTab {...ctx} />}
          {tab === 'links' && <LinksTab {...ctx} />}
          {tab === 'journal' && <JournalTab {...ctx} />}
          {tab === 'members' && <MembersTab {...ctx} />}
          {tab === 'activity' && <ActivityTab {...ctx} />}
        </div>
      </div>
      {guideOpen && <UsageGuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
