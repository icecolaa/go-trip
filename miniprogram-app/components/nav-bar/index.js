Component({
  options: {
    // 页面/全局样式（app.wxss 的 .ic 图标类、.press）穿透进组件
    styleIsolation: 'apply-shared'
  },
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    photo: { type: Boolean, value: false }, // 覆于照片上：白字、透明底
    float: { type: Boolean, value: false }  // 去表头：无标题行，仅悬浮返回键
  },
  data: {
    sbH: 44, navH: 44
  },
  lifetimes: {
    attached() {
      const wi = wx.getWindowInfo()
      let mb = { top: 50, height: 32 }
      try { mb = wx.getMenuButtonBoundingClientRect() } catch (e) { /* 开发者工具兜底 */ }
      const sbH = wi.statusBarHeight || 44
      this.setData({
        sbH,
        navH: (mb.top - sbH) * 2 + mb.height
      })
    }
  },
  methods: {
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) wx.navigateBack({ delta: 1 })
      else wx.switchTab({ url: '/pages/home/home' })
    }
  }
})
