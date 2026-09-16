import Taro from '@tarojs/taro'
import { API_BASE } from '../config'

/**
 * 与 client/src/api.ts 同构的 API 封装：
 * - Bearer 会话存小程序本地存储（TOKEN_KEY）
 * - 统一归一化服务端错误（{ error: string } → ApiFail）
 * - 401 自动清会话，页面层据此跳登录
 */

const TOKEN_KEY = 'gotrip_token'

export function getToken(): string {
  try {
    return Taro.getStorageSync(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(t: string): void {
  try {
    if (t) Taro.setStorageSync(TOKEN_KEY, t)
    else Taro.removeStorageSync(TOKEN_KEY)
  } catch {
    /* 存储满等异常忽略 */
  }
}

export class ApiFail extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: any): Promise<T> {
  const header: Record<string, string> = {}
  const token = getToken()
  if (token) header['Authorization'] = `Bearer ${token}`
  if (body !== undefined) header['content-type'] = 'application/json'

  let res: Taro.request.SuccessCallbackResult<any>
  try {
    res = await Taro.request({
      url: API_BASE + url,
      method,
      header,
      data: body !== undefined ? body : undefined,
    })
  } catch {
    throw new ApiFail(0, '网络连接失败，请稍后再试')
  }

  const data: any = res.data ?? null
  if (res.statusCode < 200 || res.statusCode >= 300) {
    if (res.statusCode === 401) setToken('')
    throw new ApiFail(res.statusCode, data?.error || `请求失败（${res.statusCode}）`)
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: any) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: any) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}
