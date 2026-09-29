Component({
  options: {
    // 页面/全局样式（app.wxss 的 .ic 图标类、.press）穿透进组件
    styleIsolation: 'apply-shared'
  },
  data: {
    selected: 0,
    list: [
      { path: '/pages/home/home', type: 'tab', icon: 'home', text: '首页' },
      { path: '/pages/trip-mode/trip-mode', type: 'cta', text: '出发' },
      { path: '/pages/profile/profile', type: 'tab', icon: 'user', text: '我的' }
    ]
  },
  methods: {
    switchTab(e) {
      wx.switchTab({ url: e.currentTarget.dataset.path })
    },
    // 页面 onShow 里调用：this.getTabBar().setSelected(n)
    setSelected(i) {
      if (this.data.selected !== i) this.setData({ selected: i })
    }
  }
})
