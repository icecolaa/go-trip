// 出发吧 GoTrip · 原生版（参考工程 + rdb 真数据）
// 云环境初始化：数据模型 models.* 与 callContainer 共用 CLOUD_ENV
const { CLOUD_ENV } = require('./utils/rdb/config')

App({
  onError(msg) {
    try {
      const prev = wx.getStorageSync('__app_err') || ''
      wx.setStorageSync('__app_err', (prev + ' | ' + String(msg)).slice(-4500))
    } catch (e) { /* ignore */ }
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库过低，请升级微信')
      return
    }
    try { wx.cloud.init({ env: CLOUD_ENV, traceUser: true }) } catch (e) { /* 重复 init 忽略 */ }
  }
})
