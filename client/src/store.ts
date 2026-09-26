import { create } from 'zustand';
import { restoreSession, loginWithPassword, loginAnonymous, logout as authLogout } from './rdb/auth';
import type { Profile } from './types';

interface AppState {
  me: Profile | null;
  ready: boolean;
  toasts: { id: number; text: string; err?: boolean }[];
  loadMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
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
    try {
      const me = await restoreSession();
      set({ me, ready: true });
    } catch {
      set({ me: null, ready: true });
    }
  },

  login: async (username, password) => {
    const me = await loginWithPassword(username, password);
    set({ me });
  },

  loginAnonymously: async () => {
    const me = await loginAnonymous();
    set({ me });
  },

  logout: async () => {
    await authLogout();
    set({ me: null });
  },

  toast: (text, err) => {
    const id = toastSeq++;
    set(s => ({ toasts: [...s.toasts, { id, text, err }] }));
    setTimeout(() => get().dismiss(id), 2600);
  },

  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
