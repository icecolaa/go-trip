/** 容器代理通道（callContainer）：仅承载必须守密钥的端点——AI/飞哪儿/POI/天气/分享。
 * 行程数据已改走 src/rdb/（数据模型直连），不要再往这里加 CRUD。 */
import Taro from '@tarojs/taro'
import { CLOUD_ENV, WX_SERVICE } from '../config'

export class ApiFail extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', data?: unknown): Promise<T> {
  try {
    const res = await (Taro.cloud.callContainer as any)({
      config: { env: CLOUD_ENV }, // Taro 类型未收录 config 字段，微信侧必填
      path,
      method,
      header: { 'X-WX-SERVICE': WX_SERVICE, 'Content-Type': 'application/json' },
      data,
      timeout: 40000, // 飞哪儿搜索最长达 10-40s
    })
    if (res.statusCode >= 400) throw new ApiFail(res.statusCode, res.data?.error || `请求失败（${res.statusCode}）`)
    return res.data as T
  } catch (e) {
    if (e instanceof ApiFail) throw e
    throw new ApiFail(0, '网络连接失败，请稍后重试')
  }
}

export const api = {
  get: <T = unknown>(url: string) => call<T>(url, 'GET'),
  post: <T = unknown>(url: string, data?: unknown) => call<T>(url, 'POST', data),
  patch: <T = unknown>(url: string, data?: unknown) => call<T>(url, 'PATCH', data),
  del: <T = unknown>(url: string) => call<T>(url, 'DELETE'),
}
