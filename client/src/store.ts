import { create } from 'zustand';
import { api, getToken, setToken, type Me } from './api';

interface AppState {
  me: Me | null;
  ready: boolean;
  toasts: { id: number; text: string; err?: boolean }[];
  loadMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
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
    if (!getToken()) {
      set({ me: null, ready: true });
      return;
    }
    try {
      const me = await api.get<Me>('/api/me');
      set({ me, ready: true });
    } catch {
      setToken('');
      set({ me: null, ready: true });
    }
  },

  login: async (username, password) => {
    const r = await api.post<{ token: string; user: Me }>('/api/auth/login', { username, password });
    setToken(r.token);
    set({ me: r.user });
  },

  register: async (username, password, nickname) => {
    const r = await api.post<{ token: string; user: Me }>('/api/auth/register', { username, password, nickname });
    setToken(r.token);
    set({ me: r.user });
  },

  logout: async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    setToken('');
    set({ me: null });
  },

  toast: (text, err) => {
    const id = toastSeq++;
    set(s => ({ toasts: [...s.toasts, { id, text, err }] }));
    setTimeout(() => get().dismiss(id), 2600);
  },

  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
