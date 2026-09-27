const store = require('../../utils/store')
const theme = require("../../utils/theme")

Page({
  data: {
    themeClass: '',
    failed: false // store.ready() 失败时停留并显示手动进入按钮
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  onHide() { this.clearTimer() },
  onUnload() { this.clearTimer() },
  clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  },
  async boot() {
    try {
      await store.ready()
      if (this._gone) return
      // 品牌视觉停留约 1.2s 后自动进入首页
      this._timer = setTimeout(() => {
        this._timer = null
        this._gone = true
        wx.switchTab({ url: '/pages/home/home' })
      }, 1200)
    } catch (e) {
      this.setData({ failed: true })
      wx.showToast({ title: (e && e.message) || '初始化失败，可手动进入', icon: 'none' })
    }
  },
  goHome() {
    this.clearTimer()
    this._gone = true
    wx.switchTab({
      url: '/pages/home/home',
      fail() { wx.showToast({ title: '跳转失败，请重试', icon: 'none' }) }
    })
  }
})
