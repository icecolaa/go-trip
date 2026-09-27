const store = require('../../utils/store')
const theme = require("../../utils/theme")

function md(iso) {
  const p = (iso || '').split('-')
  if (p.length < 3) return ''
  return `${parseInt(p[1], 10)}月${parseInt(p[2], 10)}日`
}

Page({
  data: {
    themeClass: '',
    ready: false,
    empty: false, // 未选定行程（未从首页进入）
    tripTitle: '',
    range: '',
    memberCount: 0,
    coverEmoji: '🧭',
    coverColor: '#2E92ED'
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
    const t = store.trip
    if (!t) {
      this.setData({ ready: true, empty: true })
      return
    }
    const range = t.start && t.endDate ? `${md(t.start)} – ${md(t.endDate)}` : (md(t.start) || '日期待定')
    this.setData({
      ready: true,
      empty: false,
      tripTitle: t.title || '未命名旅程',
      range,
      memberCount: (store.members || []).length,
      coverEmoji: t.coverEmoji || '🧭',
      coverColor: t.coverColor || '#2E92ED'
    })
  },
  onShareAppMessage() {
    // onShareAppMessage 可能早于 ready 触发，fail-soft 兜底
    const t = store.trip || null
    const title = ((t && t.title) || '这次旅程') + ' · 一起来规划行程吧'
    return {
      title,
      path: '/pages/overview/overview'
    }
  },
  goHome() {
    wx.switchTab({
      url: '/pages/home/home',
      fail() { wx.showToast({ title: '跳转失败，请重试', icon: 'none' }) }
    })
  },
  close() { wx.navigateBack({ delta: 1, fail: () => this.goHome() }) }
})
