/** 服务通道（Web 全栈版）：AI/飞哪儿/POI/天气走同源 /api（server 内置模块，Bearer 会话）。
 * 旧云托管公网域名 + x-gotrip-key 共享密钥通道随 PocketBay 部署退役。 */
import { getToken } from '../api';

export class ApiFail extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let resp: Response;
  try {
    resp = await fetch(path, {
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
