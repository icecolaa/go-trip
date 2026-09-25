import { api, setToken } from './request'
import type { Me } from '../types'

/**
 * 微信静默登录：仅生产（USE_CLOUD，callContainer 通道）下有效——
 * callContainer 请求由微信网关自动注入 x-wx-openid，服务端 POST /api/auth/wechat
 * 据此找用户/静默注册并签发 Bearer token。
 * 开发直连本机时无 openid 头，服务端必回 400，调用方应兜底到账号密码登录页。
 */
export async function wechatLogin(): Promise<Me> {
  const r = await api.post<{ token: string; user: Me }>('/api/auth/wechat', {})
  setToken(r.token)
  return r.user
}
