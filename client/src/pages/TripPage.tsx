import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { loadTripBundle } from '../rdb/trip';
import { proxy } from '../rdb/proxy';
import type { TripBundle, WeatherDay } from '../types';
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
  { key: 'handbook', label: '锦囊', ico: '📖', opt: true },
  { key: 'links', label: '攻略', ico: '🔗', opt: true },
  { key: 'journal', label: '日志', ico: '✍️', opt: true },
  { key: 'members', label: '成员', ico: '👥', opt: true },
  { key: 'activity', label: '动态', ico: '📣', opt: true },
] as const;

/** 手机端横滚放不下的板块（opt: true）改从右上角「⋯」进入 */
const OVERFLOW_TABS = TABS.filter(t => 'opt' in t && t.opt);

/** 手机端导航放不下的项，收进右上角「⋯」菜单 */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function TripPage() {
  const { id } = useParams();
  const tripId = String(id || '');
  const { toast } = useApp();
  const [bundle, setBundle] = useState<TripBundle | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'itinerary';
  const tab = TABS.some(t => t.key === rawTab) ? rawTab : 'itinerary';
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const reloadTimer = useRef<number | null>(null);
  const paneTop = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      setBundle(await loadTripBundle(tripId));
    } catch (e: any) {
      setLoadErr(e.message || '加载失败');
    }
  }, [tripId]);

  // 天气：客户端把目的地名+日期区间传给容器代理（容器不再读库）
  const loadWeather = useCallback(() => {
    loadTripBundle(tripId).then((b) => {
      const counts = new Map<string, number>();
      for (const d of b.days) counts.set(d.place || '', (counts.get(d.place || '') || 0) + 1);
      const main = [...counts.entries()].sort((a, b2) => b2[1] - a[1])[0]?.[0] || b.trip.destination || '';
      const dates = b.days.map(d => d.date);
      if (!main || !dates.length) return;
      proxy.get<WeatherDay[]>(`/api/weather?place=${encodeURIComponent(main)}&dates=${dates.map(encodeURIComponent).join(',')}`)
        .then(setWeather).catch(() => {});
    }).catch(() => {});
  }, [tripId]);

  useEffect(() => {
    load();
    loadWeather();
  }, [load, loadWeather]);

  // 切换板块后平滑滚到板块标题处（不遮标题：scroll-margin-top 已留出导航高度）
  useEffect(() => {
    paneTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tab]);

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
  const canEdit = true; // 单主人架构：当前登录身份即主人
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
        coverImage={trip.coverImage ?? undefined}
      >
        <div className="cover-hero-foot">
          <Countdown startDate={trip.startDate} endDate={trip.endDate} />
          <div className="cover-hero-side">
            {trip.budget > 0 && <span className="cover-chip">预算 {yuan(trip.budget)} · 已花 {yuan(bundle.budget.total)}</span>}
            <button className="btn sm" onClick={() => setSearchParams({ tab: 'members' })}>同行伙伴</button>
          </div>
        </div>
        <div className="avatar-stack cover-avatars">
          {members.slice(0, 6).map(m => (
            <span key={m.id} style={{ position: 'relative' }}>
              <Avatar name={m.displayName} color={m.avatarColor} />
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
            <span className="ov-v">
              {tripProgress(trip)}%
              {trip.description && <span className="ov-desc"> · {trip.description}</span>}
            </span>
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
              className={`nav-link ${'opt' in t && t.opt ? 'opt' : ''} ${tab === t.key ? 'on' : ''}`}
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
                {OVERFLOW_TABS.map(t => (
                  <button key={t.key} type="button" role="menuitem" className={tab === t.key ? 'on' : ''}
                    onClick={() => { setMoreOpen(false); setSearchParams({ tab: t.key }); }}>
                    <span className="ico">{t.ico}</span> {t.label}
                  </button>
                ))}
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setGuideOpen(true); }}>📖 使用说明</button>
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); location.hash = '#/'; }}>← 返回全部旅程</button>
              </div>
            )}
          </div>
        </nav>

        {/* 内容区：scroll-margin-top 显式留出顶栏+吸顶导航的高度，跳转不会遮住板块标题 */}
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
