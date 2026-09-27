"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rdbClient = rdbClient;
exports.model = model;
/** CloudBase 数据模型客户端（单例）。
 * 身份：wx.cloud 原生 openid，平台自动注入 _openid；模型权限默认「仅创建者可读写」。
 * 客户端永不接触 openid 本身——list 自己的行即得 profile。
 */
const wx_cloud_client_sdk_1 = require("@cloudbase/wx-cloud-client-sdk");
const config_1 = require("./config");
let client = null;
function rdbClient() {
    if (!client) {
        if (!config_1.CLOUD_ENV)
            throw new Error('未配置云开发环境 ID');
        const cloud = typeof wx !== 'undefined' ? wx.cloud : undefined;
        if (!cloud)
            throw new Error('当前环境不支持云开发（仅小程序可用）');
        try {
            cloud.init({ env: config_1.CLOUD_ENV });
        }
        catch { /* 重复 init 抛错可忽略 */ }
        client = (0, wx_cloud_client_sdk_1.init)(cloud, { envId: config_1.CLOUD_ENV });
    }
    return client;
}
function model(name) {
    const m = rdbClient().models?.[name];
    if (!m)
        throw new Error(`数据模型不存在：${name}`);
    return m;
}
