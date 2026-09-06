import type {
  TripBundle, PublicUser, Poi, ParsedGuide, WeatherDay, MemberRole,
} from '@shared/types';

const TOKEN_KEY = 'gotrip_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t: string): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiFail extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data: any = null;
  try { data = await resp.json(); } catch { /* ignore */ }
  if (!resp.ok) {
    throw new ApiFail(resp.status, data?.error || `请求失败（${resp.status}）`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: any) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: any) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/* ======== 类型复用 ======== */
export interface Me extends PublicUser { }
export interface TripCardInfo {
  id: number; title: string; destination: string; description: string;
  startDate: string; endDate: string; coverEmoji: string; coverColor: string;
  budget: number; myRole: MemberRole;
  memberPreview: { displayName: string; avatarColor: string; userId: number | null }[];
  totalSpent: number; activityCount: number;
}
export type { TripBundle, Poi, ParsedGuide, WeatherDay };
