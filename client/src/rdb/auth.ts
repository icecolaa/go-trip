/** CloudBase 身份认证：账密登录 + 匿名试用。
 * 登录身份决定数据模型行级隔离（_openid = 身份 uid），每身份一套独立数据。
 * ⚠️ js-sdk v3 的 auth 方法失败时【不抛异常】：signInWithPassword 返回 {data,error}，
 * signUp/signInAnonymously 把错误 body 原样 resolve——必须逐个检查返回值，
 * 否则错误被静默吞掉（曾致「注册假成功进了匿名身份」「登录失败还继续跑建档」）。
 * 平台不支持纯用户名+密码自助注册（/auth/v1/signup 501 实测），账号在 CloudBase
 * 控制台「身份认证→用户管理」手动创建。 */
import { auth } from './client';
import { ensureProfile } from './trip';
import type { Profile } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 错误码 → 用户可读文案（服务端 error_description 常为英文，统一映射中文） */
const AUTH_ERR_TEXT: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: '用户名或密码不正确',
  INVALID_CREDENTIALS: '用户名或密码不正确',
  USER_NOT_FOUND: '账号不存在，请先联系管理员在云开发控制台创建',
  PASSWORD_NOT_SET: '该账号未设置密码，请联系管理员在云开发控制台设置',
  CAPTCHA_REQUIRED: '登录尝试过多，请稍后再试',
  INVALID_STATUS: '账号已被临时锁定，请稍后再试',
  PROVIDER_NOT_ENABLED: '该登录方式未开启',
  UNIMPLEMENTED: '平台不支持该登录方式',
};

/** auth 调用结果统一检查。两种失败形态：
 * A. signInWithPassword 的 {data, error: AuthError}；
 * B. signUp/signInAnonymously resolve 的裸错误 body（含 code/error_code，无 access_token）。 */
function throwOnAuthError(res: any, fallback: string): void {
  if (res && 'data' in res) {
    if (!res.error) return;
    const code = String(res.error.code ?? res.error.errorCode ?? res.error.category ?? '').toUpperCase();
    throw new Error(AUTH_ERR_TEXT[code] || res.error.message || fallback);
  }
  if (res && (res.error_code != null || res.error != null)) {
    const code = String(res.code ?? '').toUpperCase();
    throw new Error(AUTH_ERR_TEXT[code] || res.error_description || fallback);
  }
  if (!res?.access_token) throw new Error(fallback);
}

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
  const r = await auth().signInWithPassword({ username, password });
  throwOnAuthError(r, '登录失败，请稍后再试');
  return ensureProfile();
}

/** 匿名试用：独立匿名身份，数据与正式账号不互通（匿名可转正式继承数据，平台能力）。 */
export async function loginAnonymous(): Promise<Profile> {
  const r = await auth().signInAnonymously();
  throwOnAuthError(r, '游客登录失败，请稍后再试');
  return ensureProfile();
}

export async function logout(): Promise<void> {
  try { await auth().signOut(); } catch { /* 已登出忽略 */ }
}
