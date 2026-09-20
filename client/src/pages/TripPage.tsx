import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api, getToken, type TripBundle } from '../api';
import { useApp } from '../store';
import { Avatar, tripProgress, yuan, fmtDate, weekOf } from '../components/ui';
import Countdown from '../components/Countdown';
import CoverHero from '../components/CoverHero';
import RouteMap, { deriveStops } from '../components/RouteMap';
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
import TransportStayTab from './tabs/TransportStayTab';
import PlacesTab from './tabs/PlacesTab';

/** 板块顺序：行程｜交通住宿｜景点餐厅｜地图｜预算｜清单｜锦囊｜攻略｜日志｜成员｜动态 */
const TABS = [
  { key: 'itinerary', label: '行程', ico: '🗓️' },
  { key: 'transport', label: '交通住宿', ico: '✈️' },
  { key: 'places', label: '景点餐厅', ico: '📍' },
  { key: 'map', label: '地图', ico: '🗺️' },
  { key: 'budget', label: '预算', ico: '💰' },
  { key: 'packing', label: '清单', ico: '🎒' },
  { key: 'handbook', label: '锦囊', ico: '📖' },
  { key: 'links', label: '攻略', ico: '🔗' },
  { key: 'journal', label: '日志', ico: '✍️' },
  { key: 'members', label: '成员', ico: '👥' },
  { key: 'activity', label: '动态', ico: '📣' },
] as const;

/** 手机端导航放不下的项，收进右上角「⋯」菜单 */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
  const [moreOpen, setMoreOpen] = useState(false);
  const reloadTimer = useRef<number | null>(null);
  const paneTop = useRef<HTMLDivElement | null>(null);

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

  // 切换板块后平滑滚到板块标题处（不遮标题：scroll-margin-top 已留出导航高度）
  useEffect(() => {
    paneTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tab]);

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
  const ctx = { bundle, reload: load, reloadWeather: loadWeather, weather, canEdit, goTab: (t: string) => setSearchParams({ tab: t }) };

  // 主要路线与逐日地点（供路线总览图使用）
  const dayPlaces = [...bundle.days].sort((a, b) => a.dayNumber - b.dayNumber).map(d => d.place).filter(Boolean);
  const stops = deriveStops(trip.destination || '', dayPlaces);

  // 下一段关键交通：未来第一条交通条目；行程未开始则取第一条
  const dayById = new Map(bundle.days.map(d => [d.id, d]));
  const transports = bundle.activities
    .filter(a => a.kind === 'transport')
    .sort((a, b) => {
      const da = dayById.get(a.dayId)?.date || '';
      const db = dayById.get(b.dayId)?.date || '';
      return da === db ? (a.time || '').localeCompare(b.time || '') : da.localeCompare(db);
    });
  const today = todayStr();
  const nextTransport = transports.find(a => (dayById.get(a.dayId)?.date || '') >= today) || transports[0];

  return (
    <div className="page">
      {/* 旅程头图：标题/年份/地区/日期 + 出发倒计时 */}
      <CoverHero
        title={trip.title}
        destination={trip.destination}
        startDate={trip.startDate}
        endDate={trip.endDate}
        coverImage={trip.coverImage}
      >
        <div className="cover-hero-foot">
          <Countdown startDate={trip.startDate} endDate={trip.endDate} />
          <div className="cover-hero-side">
            {trip.budget > 0 && <span className="cover-chip">预算 {yuan(trip.budget)} · 已花 {yuan(bundle.budget.total)}</span>}
            {onlineCount > 0 && (
              <span className="cover-chip"><span className="dot-online" aria-hidden="true" /> {onlineCount} 人在线</span>
            )}
            <button className="btn sm" onClick={() => setSearchParams({ tab: 'members' })}>管理成员</button>
          </div>
        </div>
        <div className="avatar-stack cover-avatars">
          {members.slice(0, 6).map(m => (
            <span key={m.id} style={{ position: 'relative' }}>
              <Avatar name={m.displayName} color={m.avatarColor} />
              {m.userId && bundle.onlineMemberIds.includes(m.userId) && (
                <span className="avatar-online-dot" />
              )}
            </span>
          ))}
        </div>
      </CoverHero>

      {/* 路线总览 + 下一段关键交通 + 进度 */}
      <div className="card trip-overview">
        <RouteMap destination={trip.destination || ''} dayPlaces={dayPlaces} />
        <div className="overview-foot">
          <div className="ov-block">
            <span className="ov-k">主要路线</span>
            <span className="ov-v">{stops.length ? stops.map(s => s.name).join(' → ') : '待填写目的地'}</span>
          </div>
          <div className="ov-block">
            <span className="ov-k">下一段关键交通</span>
            {nextTransport ? (
              <span className="ov-v">
                {fmtDate(dayById.get(nextTransport.dayId)?.date || '')} {weekOf(dayById.get(nextTransport.dayId)?.date || '')}
                {nextTransport.time ? ` ${nextTransport.time}` : ''} · {nextTransport.title}
                {nextTransport.place ? `（${nextTransport.place}）` : ''}
              </span>
            ) : (
              <span className="ov-v muted">暂无交通安排</span>
            )}
          </div>
          <div className="ov-block ov-progress">
            <span className="ov-k">旅程进度</span>
            <div className="progress-line"><div style={{ width: `${tripProgress(trip)}%` }} /></div>
            <span className="ov-v">{tripProgress(trip)}%{trip.description ? ` · ${trip.description}` : ''}</span>
          </div>
        </div>
      </div>

      <div className="trip-layout">
        {/* 板块导航：桌面左侧栏 / 手机 sticky 横滚条 */}
        <nav className="card trip-nav" aria-label="旅程板块">
          {TABS.map(t => (
            <Link
              key={t.key}
              to={`?tab=${t.key}`}
              className={`nav-link ${tab === t.key ? 'on' : ''}`}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              <span className="ico">{t.ico}</span>{t.label}
            </Link>
          ))}
          <div className="more-wrap">
            <button
              type="button"
              className="nav-link more-btn"
              onClick={() => setMoreOpen(o => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
            >
              <span className="ico">⋯</span>更多
            </button>
            {moreOpen && (
              <div className="trip-more-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setGuideOpen(true); }}>使用说明</button>
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); location.hash = '#/'; }}>← 返回全部旅程</button>
              </div>
            )}
          </div>
        </nav>

        {/* 内容区 */}
        <div className="tab-pane" key={tab} ref={paneTop}>
          {tab === 'itinerary' && <ItineraryTab {...ctx} />}
          {tab === 'transport' && <TransportStayTab {...ctx} />}
          {tab === 'places' && <PlacesTab {...ctx} />}
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
