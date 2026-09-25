/** CloudBase 数据模型客户端（单例）。
 * 身份：wx.cloud 原生 openid，平台自动注入 _openid；模型权限默认「仅创建者可读写」。
 * 客户端永不接触 openid 本身——list 自己的行即得 profile。
 */
import { init } from '@cloudbase/wx-cloud-client-sdk';
import { CLOUD_ENV } from '../config';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const wx: any;

let client: any = null;

export function rdbClient(): any {
  if (!client) {
    if (!CLOUD_ENV) throw new Error('未配置云开发环境 ID');
    const cloud = typeof wx !== 'undefined' ? wx.cloud : undefined;
    if (!cloud) throw new Error('当前环境不支持云开发（仅小程序可用）');
    try { cloud.init({ env: CLOUD_ENV }); } catch { /* 重复 init 抛错可忽略 */ }
    client = init(cloud, { envId: CLOUD_ENV });
  }
  return client;
}

export function model(name: string): any {
  const m = rdbClient().models?.[name];
  if (!m) throw new Error(`数据模型不存在：${name}`);
  return m;
}
