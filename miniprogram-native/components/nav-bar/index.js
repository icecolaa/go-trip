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
    sbH: 44, navH: 44,
    capW: 87, capH: 32, capTop: 6, capR: 10
  },
  lifetimes: {
    attached() {
      const wi = wx.getWindowInfo()
      let mb = { width: 87, height: 32, top: 50, right: 0 }
      try { mb = wx.getMenuButtonBoundingClientRect() } catch (e) { /* 开发者工具兜底 */ }
      const sbH = wi.statusBarHeight || 44
      this.setData({
        sbH,
        navH: (mb.top - sbH) * 2 + mb.height,
        capW: mb.width, capH: mb.height,
        // 胶囊 top 相对本组件（组件顶部 = 状态栏顶），非页面绝对坐标
        capTop: Math.max(0, mb.top - sbH),
        capR: wi.windowWidth - mb.right
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
