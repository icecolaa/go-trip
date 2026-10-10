import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../store';
import { useTheme } from '../theme';

/* ---------- 头像 ---------- */
export function Avatar({ name, color, size }: { name: string; color: string; size?: 'sm' | 'lg' }) {
  const ch = (name || '旅').trim().charAt(0).toUpperCase();
  return (
    <span className={`avatar ${size || ''}`} style={{ background: color }} title={name}>
      {ch}
    </span>
  );
}

/* ---------- 弹窗 ---------- */
export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-mask" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { maxWidth: width } : undefined}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.err ? 'err' : ''}`} onClick={() => dismiss(t.id)}>{t.text}</div>
      ))}
    </div>
  );
}

/* ---------- 主题切换 ---------- */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      className="btn sm ghost"
      onClick={toggle}
      title={resolved === 'dark' ? '切换到浅色' : '切换到深色'}
      aria-label={resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      {resolved === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

/* ---------- 工作台顶栏（晴空航线桌面层）：旅程切换 + 搜索 + 头像 ---------- */
export function TopBar({ me }: { me: { nickname: string; avatarColor: string } | null }) {
  const nav = useNavigate();
  const loc = useLocation();
  const inTrip = loc.pathname.startsWith('/trip/');
  let tripTitle = '';
  let tripId = '';
  try {
    tripTitle = localStorage.getItem('gotrip_last_trip_title') || '';
    tripId = localStorage.getItem('gotrip_last_trip') || '';
  } catch { /* ignore */ }
  const switchTo = inTrip ? loc.pathname + loc.search : (tripId ? `/trip/${tripId}` : '/');
  return (
    <header className="topbar">
      <div className="trip-switch" onClick={() => nav(switchTo)} title="当前旅程工作台">
        <i className="ic ic-flag" />
        <span className="t">{tripTitle || '选择旅程'}</span>
        <span className="live" />
      </div>
      <div className="spacer" />
      <div className="input search" style={{ height: 38 }}>
        <i className="ic ic-search" />
        <span>搜索地点 / 账单 / 日志…</span>
      </div>
      <ThemeToggle />
      {me && (
        <Link
          to="/settings"
          className="avatar"
          title={me.nickname + ' · 设置'}
          style={{ background: me.avatarColor || 'linear-gradient(135deg, var(--sky400), var(--sky600))', textDecoration: 'none' }}
        >{me.nickname.slice(0, 1)}</Link>
      )}
    </header>
  );
}

/* ---------- 日期工具 ---------- */
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${Number(m)}月${Number(day)}日`;
}
export function weekOf(d: string): string {
  return WEEK[new Date(d + 'T00:00:00').getDay()];
}
export function daysUntil(dateStr: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
export function countdownText(trip: { startDate: string; endDate: string }): string {
  const s = daysUntil(trip.startDate);
  const e = daysUntil(trip.endDate);
  if (e < 0) return '已结束';
  if (s <= 0 && e >= 0) return '进行中';
  if (s === 1) return '明天出发';
  return `还有 ${s} 天出发`;
}
export function tripProgress(trip: { startDate: string; endDate: string }): number {
  const s = new Date(trip.startDate + 'T00:00:00').getTime();
  const e = new Date(trip.endDate + 'T00:00:00').getTime();
  const n = Date.now();
  if (n <= s) return 0;
  if (n >= e + 86400000) return 100;
  return Math.round(((n - s) / (e + 86400000 - s)) * 100);
}
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}
export const yuan = (n: number): string => `¥${(Math.round(n * 100) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

export const KIND_META: Record<string, { label: string; icon: string }> = {
  sight: { label: '景点', icon: '🏞️' },
  food: { label: '美食', icon: '🍜' },
  hotel: { label: '住宿', icon: '🏨' },
  transport: { label: '交通', icon: '🚄' },
  shopping: { label: '购物', icon: '🛍️' },
  show: { label: '演出', icon: '🎭' },
  other: { label: '其他', icon: '📌' },
};

export const EXPENSE_CATS = ['交通', '住宿', '餐饮', '门票', '购物', '娱乐', '其他'];
export const EXPENSE_CAT_ICON: Record<string, string> = {
  交通: '🚄', 住宿: '🏨', 餐饮: '🍜', 门票: '🎫', 购物: '🛍️', 娱乐: '🎡', 其他: '📌',
};

export const AVATAR_COLORS = ['#2f6e4f', '#b5543b', '#3b6ea5', '#c9a04e', '#7d5ba6', '#4e8d7c', '#a06a3b', '#5d6d4e'];
