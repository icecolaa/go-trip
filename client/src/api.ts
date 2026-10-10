/** Web 版 API 客户端（PocketBay 全栈部署，2026-10-10）。
 * 数据与 AI/飞哪儿/天气等全部走 /api；Bearer token 会话存 localStorage。
 * ⚠️ PocketBay 壳把应用嵌在跨源 iframe（gotrip--e.pocketbay.app）里，同源 /api 不存在——
 * 非主域时 API 一律打主域绝对地址（server CORS 放行 *.pocketbay.app）。 */

const API_BASE = (() => {
  try {
    const h = location.hostname;
    if (h === 'gotrip.pocketbay.app' || !h.endsWith('pocketbay.app')) return '';
    return 'https://gotrip.pocketbay.app';
  } catch { return ''; }
})();

const TOKEN_KEY = 'gotrip_token';

export function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(t: string): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* 隐私模式 */ }
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
  let resp: Response;
  try {
    resp = await fetch(API_BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiFail(0, '网络连接失败，请稍后重试');
  }
  let data: any = null;
  try { data = await resp.json(); } catch { /* ignore */ }
  if (!resp.ok) {
    if (resp.status === 401) setToken('');
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

/** 认证响应形状（server/webauth.ts） */
export interface AuthUser {
  id: string;
  username: string | null;
  nickname: string;
  avatarColor: string;
  bio: string;
  avatarUrl: string | null;
}

export interface AuthResult { token: string; user: AuthUser }
