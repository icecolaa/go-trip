/** Web 端配置（rdb 直连架构，2026-09-26）。
 *  - 数据：@cloudbase/js-sdk v3 models.*（与小程序 wx-cloud-client-sdk 同一套实现）
 *  - 容器代理：AI/飞哪儿/POI/天气走云托管公网域名（无 callContainer，用共享密钥过身份门）
 */

/** 云开发环境 ID（数据模型 + 云托管共用） */
export const CLOUD_ENV = 'gotrip-d1gb187o991f5260a'

/** 云托管公网域名（容器代理面：AI/飞哪儿/POI/天气） */
export const CLOUD_RUN_URL = 'https://gotrip-gotrip-d1gb187o991f5260a-1308923163.ap-shanghai.run.wxcloudrun.com'

/** 容器代理身份密钥（与容器环境变量 WEB_PROXY_KEY 一致；仅提高白嫖门槛，浏览器 bundle 可见） */
export const WEB_PROXY_KEY = 'gotrip-web-7f3a9c2e1b8d4f6a'
