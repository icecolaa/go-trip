/** CloudBase Web SDK 初始化（数据模型 models.* 与身份认证）。
 * models API 与小程序端 @cloudbase/wx-cloud-client-sdk 同构（js-sdk ./model 直接 re-export 它），
 * 因此数据层代码两端近乎原样复用。 */
import cloudbase from '@cloudbase/js-sdk';
import { CLOUD_ENV } from '../config';

/* eslint-disable @typescript-eslint/no-explicit-any */

let app: any = null;

export function cbApp(): any {
  if (!app) {
    if (!CLOUD_ENV) throw new Error('未配置云开发环境 ID');
    app = cloudbase.init({ env: CLOUD_ENV });
  }
  return app;
}

/** 数据模型客户端（app.models，全量 bundle 已自动注册） */
export function model(name: string): any {
  const m = cbApp().models?.[name];
  if (!m) throw new Error(`数据模型不存在：${name}`);
  return m;
}

/** 身份认证实例（账密/匿名登录） */
export function auth(): any {
  return cbApp().auth({ persistence: 'local' });
}
