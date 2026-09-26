/** 容器代理通道（Web）：AI/飞哪儿/POI/天气走云托管公网域名。
 * 身份门：x-gotrip-key 共享密钥（容器 WEB_PROXY_KEY 校验），CORS 已在容器放行本域名族。 */
import { CLOUD_RUN_URL, WEB_PROXY_KEY } from '../config';

export class ApiFail extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'x-gotrip-key': WEB_PROXY_KEY,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  let resp: Response;
  try {
    resp = await fetch(CLOUD_RUN_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFail(0, '网络连接失败，请稍后重试');
  }
  let data: any = null;
  try { data = await resp.json(); } catch { /* ignore */ }
  if (!resp.ok) throw new ApiFail(resp.status, data?.error || `请求失败（${resp.status}）`);
  return data as T;
}

export const proxy = {
  get: <T = unknown>(url: string) => call<T>(url, 'GET'),
  post: <T = unknown>(url: string, data?: unknown) => call<T>(url, 'POST', data),
};
