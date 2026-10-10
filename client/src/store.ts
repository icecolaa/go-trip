import { create } from 'zustand';
import { restoreSession, loginWithPassword, registerWithPassword, loginAnonymous, logout as authLogout } from './rdb/auth';
import type { Profile } from './types';

interface AppState {
  me: Profile | null;
  ready: boolean;
  toasts: { id: number; text: string; err?: boolean }[];
  loadMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
  toast: (text: string, err?: boolean) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 1;

export const useApp = create<AppState>((set, get) => ({
  me: null,
  ready: false,
  toasts: [],

  loadMe: async () => {
    // 冷启动重试：服务端建表初始化期间 me 打 503，约 18s 窗口内自愈；401 已在 restoreSession 内短路
    for (let i = 0; i < 6; i++) {
      try {
        const me = await restoreSession();
        set({ me, ready: true });
        return;
      } catch {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    set({ me: null, ready: true });
  },

  login: async (username, password) => {
    const me = await loginWithPassword(username, password);
    set({ me });
  },

  register: async (username, password, nickname) => {
    const me = await registerWithPassword(username, password, nickname);
    set({ me });
  },

  loginAnonymously: async () => {
    const me = await loginAnonymous();
    set({ me });
  },

  logout: async () => {
    await authLogout();
    // 清最近行程记忆：防止跨账号残留（A 账号行程名泄漏到 B 账号顶栏）
    try {
      localStorage.removeItem('gotrip_last_trip');
      localStorage.removeItem('gotrip_last_trip_title');
    } catch { /* ignore */ }
    set({ me: null });
  },

  toast: (text, err) => {
    const id = toastSeq++;
    set(s => ({ toasts: [...s.toasts, { id, text, err }] }));
    setTimeout(() => get().dismiss(id), 2600);
  },

  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
