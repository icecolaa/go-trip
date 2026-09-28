"use strict";
/** 云开发配置（rdb 直连架构，2026-09-26）。
 *
 * - 小程序（weapp）：数据走数据模型 models.*（wx.cloud + @cloudbase/wx-cloud-client-sdk），
 *   AI/飞哪儿/POI/天气走 callContainer——两者都用 CLOUD_ENV，开发工具里也能直接跑。
 * - H5（阶段二）：浏览器无 wx.cloud，走 CLOUD_RUN_URL + CORS（暂未切换）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_BASE = exports.CLOUD_RUN_URL = exports.WX_SERVICE = exports.CLOUD_ENV = void 0;
// 原生小程序运行时无 process 对象——必须写死字面量，禁用 process.env.*
// （Taro H5 构建已弃用，见 HANDOFF 条目 43/56；2026-09-28 白屏事故：tsc 重编译把
//   process.env.TARO_ENV 带回产物，require 即抛 ReferenceError 全局白屏）
const isH5 = false;
/** 云开发环境 ID（数据模型 + 云托管共用） */
exports.CLOUD_ENV = 'gotrip-d1gb187o991f5260a';
/** 云托管服务名（callContainer 用） */
exports.WX_SERVICE = 'gotrip';
/** 云托管公网默认域名（仅 H5 阶段二直连用） */
exports.CLOUD_RUN_URL = 'https://gotrip-gotrip-d1gb187o991f5260a-1308923163.ap-shanghai.run.wxcloudrun.com';
/** H5 直连地址（阶段二启用；weapp 不使用） */
exports.API_BASE = isH5 ? exports.CLOUD_RUN_URL : '';
