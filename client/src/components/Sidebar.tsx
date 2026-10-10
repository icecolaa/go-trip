/** Web 工作台桌面壳（晴空航线桌面层）：左侧边栏。
 * 行程上下文（/trip/:id）高亮对应 tab；无上下文时导航落到最近行程（localStorage 记忆）。 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../store';

/** 最近行程 id：localStorage 记忆（Dashboard/TripPage 打开行程时 rememberTrip） */
export function lastTripId(): string | null {
  try { return localStorage.getItem('gotrip_last_trip') || null; } catch { return null; }
}

export function rememberTrip(id: string, title?: string): void {
  try {
    localStorage.setItem('gotrip_last_trip', id);
    if (title) localStorage.setItem('gotrip_last_trip_title', title);
  } catch { /* ignore */ }
}

interface NavItem { label: string; tab?: string; path?: string; icon: string }

const PLAN_NAV: NavItem[] = [
  { label: '每日行程', tab: 'itinerary', icon: 'ic-cal' },
  { label: '交通住宿', tab: 'transportstay', icon: 'ic-car' },
  { label: '景点餐厅', tab: 'places', icon: 'ic-pin' },
  { label: '旅行地图', tab: 'map', icon: 'ic-map' },
  { label: '团队预算', tab: 'budget', icon: 'ic-wallet' },
];
const PREP_NAV: NavItem[] = [
  { label: '打包清单', tab: 'packing', icon: 'ic-list' },
  { label: '旅行锦囊', tab: 'handbook', icon: 'ic-note' },
  { label: '旅行日志', tab: 'journal', icon: 'ic-edit' },
  { label: '攻略收藏', tab: 'links', icon: 'ic-link' },
  { label: '飞哪儿', path: '/flywhere', icon: 'ic-compass' },
];
const COOP_NAV: NavItem[] = [
  { label: '成员', tab: 'members', icon: 'ic-user' },
  { label: '动态', tab: 'activity', icon: 'ic-chat' },
];

export function Sidebar({ me }: { me: { nickname: string } | null }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { logout } = useApp();
  const inTrip = loc.pathname.startsWith('/trip/');
  const tripId = inTrip ? loc.pathname.split('/')[2] : lastTripId();
  const tab = new URLSearchParams(loc.search).get('tab') || 'itinerary';
  const tripTabActive = (item: NavItem) => {
    if (item.path) return loc.pathname.startsWith(item.path);
    if (!inTrip) return false;
    if (item.tab === 'itinerary') return tab === 'itinerary';
    return tab === item.tab;
  };

  const go = (item: NavItem) => {
    const to = item.path ?? (tripId ? `/trip/${tripId}?tab=${item.tab}` : '/');
    nav(to);
  };

  const item = (n: NavItem, active: boolean) => (
    <a key={n.label} className={`sb-item${active ? ' on' : ''}`} onClick={() => go(n)}>
      <i className={`ic ${n.icon}`} />
      {n.label}
    </a>
  );

  return (
    <aside className="sb">
      <Link to="/" className="sb-brand" style={{ textDecoration: 'none' }}>
        <span
          className="logo"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--sky400), var(--sky600))', fontSize: 20 }}
        >🧭</span>
        <span>
          <span className="cn" style={{ display: 'block' }}>出发吧</span>
          <span className="en">GoTrip</span>
        </span>
      </Link>
      <div className="sb-sec">规划</div>
      <nav className="sb-nav">
        <a className={`sb-item${loc.pathname === '/' ? ' on' : ''}`} onClick={() => nav('/')}>
          <i className="ic ic-home" />
          工作台
        </a>
        {PLAN_NAV.map(n => item(n, tripTabActive(n)))}
      </nav>
      <div className="sb-sec">准备与记录</div>
      <nav className="sb-nav">
        {PREP_NAV.map(n => item(n, tripTabActive(n)))}
      </nav>
      {tripId && (
        <>
          <div className="sb-sec">协作</div>
          <nav className="sb-nav">
            {COOP_NAV.map(n => item(n, tripTabActive(n)))}
          </nav>
        </>
      )}
      <div className="sb-foot">
        <nav className="sb-nav">
          <a className={`sb-item${loc.pathname === '/settings' ? ' on' : ''}`} onClick={() => nav('/settings')}>
            <i className="ic ic-gear" />
            设置
          </a>
          {me && (
            <a className="sb-item" onClick={() => { if (window.confirm('退出登录？本地会话将被清除。')) logout(); }}>
              <i className="ic ic-key" />
              退出登录
            </a>
          )}
        </nav>
      </div>
    </aside>
  );
}
