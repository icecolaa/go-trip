/** CloudBase 身份认证：账密登录/注册 + 匿名试用。
 * 登录身份决定数据模型行级隔离（_openid = 身份 uid），每身份一套独立数据。 */
import { auth } from './client';
import { ensureProfile } from './trip';
import type { Profile } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 恢复本地登录态；有会话则返回档案。无会话返回 null（由登录页接管）。 */
export async function restoreSession(): Promise<Profile | null> {
  const a = auth();
  try {
    const state = await a.getLoginState();
    if (state?.isAuthenticated === false) return null;
    return await ensureProfile();
  } catch {
    return null;
  }
}

export async function loginWithPassword(username: string, password: string): Promise<Profile> {
  await auth().signInWithPassword({ username, password });
  return ensureProfile();
}

/** 账密注册：CloudBase 身份认证支持 username+password 直注册（开启 usernamePassword 后）。 */
export async function registerWithPassword(username: string, password: string, nickname: string): Promise<Profile> {
  await auth().signUp({ username, password, nickname });
  await auth().signInWithPassword({ username, password });
  return ensureProfile();
}

/** 匿名试用：独立匿名身份，数据与正式账号不互通（匿名可转正式继承数据，平台能力）。 */
export async function loginAnonymous(): Promise<Profile> {
  await auth().signInAnonymously();
  return ensureProfile();
}

export async function logout(): Promise<void> {
  try { await auth().signOut(); } catch { /* 已登出忽略 */ }
}
