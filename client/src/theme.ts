import { useEffect } from 'react';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'auto';

const KEY = 'gotrip_theme';

interface ThemeState {
  mode: ThemeMode;
  /** 当前生效的实际主题（auto 时跟随系统） */
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch { /* 隐私模式下不可用 */ }
  return 'auto';
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 把主题写到 <html data-theme>，并同步浏览器 UI 色与 color-scheme。
 * 注：曾试挂 theme-anim 类做 200ms 全局色面过渡——同帧挂类+换 CSS 变量会让
 * 变量传播失效（元素 color 冻结在旧值，干净环境二次实锤），回退为即切。 */
export function applyTheme(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0D1626' : '#F3F8FC');
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: readStored(),
  resolved: 'light',

  setMode: m => {
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    const resolved = m === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : m;
    applyTheme(resolved);
    set({ mode: m, resolved });
  },

  toggle: () => {
    const next = get().resolved === 'dark' ? 'light' : 'dark';
    get().setMode(next);
  },
}));

/** 在应用根组件挂载一次：应用初始主题并监听系统偏好变化 */
export function useThemeBootstrap(): void {
  const { mode, setMode } = useTheme();
  useEffect(() => {
    setMode(mode); // 首次写入 data-theme
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (useTheme.getState().mode === 'auto') useTheme.getState().setMode('auto');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
