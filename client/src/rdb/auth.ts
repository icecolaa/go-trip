/** Web 版身份认证：账密登录/自助注册 + 游客试用（PocketBay 全栈）。
 * 登录身份决定数据隔离（所有数据行挂 user_id），token 存 localStorage。
 * ⚠️ 历史：CloudBase js-sdk 时代 auth 失败不抛异常（曾致注册假成功），此处服务端
 * 直接以 HTTP 状态码 + {error} 表达失败，api.request 统一抛 ApiFail。 */
import { api, setToken, getToken, type AuthResult, type AuthUser } from '../api'
import { ensureProfile } from './trip'
import type { Profile } from '../types'

/** 恢复本地登录态；有会话则返回档案。无会话返回 null（由登录页接管）。 */
export async function restoreSession(): Promise<Profile | null> {
  if (!getToken()) return null;
  try {
    const me = await api.get<{ user: AuthUser }>('/api/auth/me');
    if (!me?.user) return null;
    return await ensureProfile(me.user);
  } catch {
    return null;
  }
}

export async function registerWithPassword(username: string, password: string, nickname?: string): Promise<Profile> {
  const r = await api.post<AuthResult>('/api/auth/register', { username, password, nickname });
  setToken(r.token);
  return ensureProfile(r.user);
}

export async function loginWithPassword(username: string, password: string): Promise<Profile> {
  const r = await api.post<AuthResult>('/api/auth/login', { username, password });
  setToken(r.token);
  return ensureProfile(r.user);
}

/** 游客试用：服务端匿名身份，数据与正式账号不互通。 */
export async function loginAnonymous(): Promise<Profile> {
  const r = await api.post<AuthResult>('/api/auth/guest');
  setToken(r.token);
  return ensureProfile(r.user);
}

export async function logout(): Promise<void> {
  try { await api.post('/api/auth/logout'); } catch { /* 已登出忽略 */ }
  setToken('');
}
