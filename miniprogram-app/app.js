// 出发吧 GoTrip · 原生版（参考工程 + rdb 真数据）
// 云环境初始化：数据模型 models.* 与 callContainer 共用 CLOUD_ENV
const { CLOUD_ENV } = require('./utils/rdb/config')
const theme = require('./utils/theme')

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
    // 启动对齐状态栏前景色；系统深浅切换（跟随系统档）实时重设——
    // 手动夜间/浅色覆盖不走 theme.json，全靠这里与 nav-bar 页面显示钩子
    theme.syncChrome()
    if (wx.onThemeChange) wx.onThemeChange(() => theme.syncChrome())
  }
})
