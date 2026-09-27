const store = require('../../utils/store')
const theme = require('../../utils/theme')

const LABELS = { auto: '跟随系统', light: '浅色', dark: '深色' }
const VERSION = 'v1.5.0'

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
      content: '出发吧 GoTrip ' + VERSION + '\n协作行程 · 记账结算 · 打包清单 · 旅行锦囊\n和同行人一起把旅行安排明白',
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
      imageUrl: '/assets/yichun-road.jpg'
    }
  }
})
