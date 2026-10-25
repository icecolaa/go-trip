const store = require('../../utils/store')
const theme = require('../../utils/theme')

const LABELS = { auto: '跟随系统', light: '浅色', dark: '深色' }
/* 版本号：优先取小程序正式版版本号，开发版/体验版/取不到时回落本地兜底。
   教训：曾长期写死 'v1.5.0'，而正式版已迭代到 1.5.32+，关于页显示的版本与实际运行版本
   长期不一致；每次发版靠人记得改一次，必然漂移——改为读正式版本，兜底只服务开发期。 */
const FALLBACK_VERSION = 'v1.5.35'
function currentVersion() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const v = info && info.miniProgram && info.miniProgram.version
    // 正式版返回 x.y.z；开发版为 'develop'、体验版为 'trial' → 一律走兜底
    if (v && /^\d+\.\d+\.\d+/.test(v)) return 'v' + v
  } catch (e) { /* 基础库不支持或异常：回落兜底 */ }
  return FALLBACK_VERSION
}

Page({
  data: { themeClass: '', themeSetting: 'auto', themeLabel: '跟随系统', shareTitle: '出发吧 · 行程（只读）' },
  onShow() {
    const s = theme.setting()
    this.setData({ themeClass: theme.currentClass(), themeSetting: s, themeLabel: LABELS[s] || '跟随系统' })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      const t = store.trip
      this.setData({ shareTitle: t && t.title ? t.title + ' 行程（只读）' : '出发吧 · 行程（只读）' })
    } catch (e) { /* 设置页不依赖行程数据，静默降级 */ }
  },
  setTheme(e) {
    const v = e.currentTarget.dataset.v
    theme.setSetting(v) // 本地记忆
    this.setData({ themeClass: theme.currentClass(), themeSetting: v, themeLabel: LABELS[v] })
    wx.showToast({ title: LABELS[v], icon: 'none' })
  },
  showAbout() {
    wx.showModal({
      title: '关于出发吧',
      content: '出发吧 GoTrip ' + currentVersion() + '\n协作行程 · 记账结算 · 打包清单 · 旅行锦囊\n和同行人一起把旅行安排明白',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  goHelper() { wx.navigateTo({ url: '/pages/helper/helper' }) },
  shareReadonly() {
    // 只读分享链接：带当前行程分享 token（无 token 时用占位）
    let token = 't' + Date.now().toString(36)
    try {
      if (store.trip && store.trip.shareToken) token = store.trip.shareToken
    } catch (e) { /* 忽略 */ }
    const link = 'https://gotrip.example/s/' + token + '?mode=ro'
    wx.setClipboardData({
      data: link,
      success: () => wx.showModal({
        title: '只读链接已复制',
        content: '对方打开后只能查看行程与账本，不能编辑。适合发给长辈或不参与规划的同行人。',
        showCancel: false
      })
    })
  },
  onShareAppMessage() {
    return {
      title: this.data.shareTitle,
      path: '/pages/home/home',
      imageUrl: '/assets/share-cover.jpg'
    }
  }
})
