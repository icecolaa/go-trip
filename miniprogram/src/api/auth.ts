import { api, setToken } from './request'
import type { Me } from '../types'

/**
 * 微信静默登录：云托管 callContainer 请求自动携带 x-wx-openid，
 * 服务端据此找用户/静默注册并签发 Bearer token。
 *
 * 直连模式（开发连本机 / 未接云托管）下服务端会 400/403，
 * 调用方应捕获后兜底到账号密码登录页。
 */
export async function wechatLogin(): Promise<Me> {
  const r = await api.post<{ token: string; user: Me }>('/api/auth/wechat', {})
  setToken(r.token)
  return r.user
}
