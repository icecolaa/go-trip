const store = require('../../utils/store')
const theme = require('../../utils/theme')

const VERSION = 'v1.5.0'

function fmtMoney(n) {
  n = Number(n) || 0
  if (n >= 10000) return '¥' + (Math.round(n / 1000) / 10) + '万'
  return '¥' + n.toLocaleString()
}

Page({
  data: {
    themeClass: '',
    loading: true,
    nickname: '旅行家',
    initial: '旅',
    level: 1,
    gid: '——',
    statTrips: 0,
    statCities: 0,
    statStops: 0,
    statSpent: '¥0'
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    if (typeof this.getTabBar === 'function') this.getTabBar().setSelected(2)
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      this.apply()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  apply() {
    const p = store.profile || {}
    const trips = store.trips || []
    const nick = p.nickname || '旅行家'
    const idStr = String(p.id || '')
    const cities = {}
    let stops = 0
    let spent = 0
    trips.forEach((t) => {
      if (t.destination) cities[t.destination] = 1
      stops += Number(t.activityCount) || 0
      spent += Number(t.totalSpent) || 0
    })
    this.setData({
      loading: false,
      nickname: nick,
      initial: (nick || '旅').slice(0, 1),
      level: Math.min(9, trips.length + 1),
      gid: idStr ? idStr.slice(-6).toUpperCase() : '——',
      statTrips: trips.length,
      statCities: Object.keys(cities).length,
      statStops: stops,
      statSpent: fmtMoney(spent)
    })
  },
  editNickname() {
    wx.showModal({
      title: '编辑昵称',
      editable: true,
      content: this.data.nickname,
      success: (r) => {
        if (!r.confirm) return
        const name = (r.content || '').trim()
        if (!name) { wx.showToast({ title: '昵称不能为空', icon: 'none' }); return }
        store.updateNickname(name)
          .then(() => {
            this.apply()
            wx.showToast({ title: '已保存', icon: 'success' })
          })
          .catch((e) => wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' }))
      }
    })
  },
  showAbout() {
    wx.showModal({
      title: '关于出发吧',
      content: '出发吧 GoTrip ' + VERSION + '\n协作行程 · 记账结算 · 打包清单 · 旅行锦囊\n和同行人一起把旅行安排明白',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  goMessages() { wx.navigateTo({ url: '/pages/messages/messages' }) },
  goTrips() { wx.switchTab({ url: '/pages/home/home' }) },
  goFlights() { wx.navigateTo({ url: '/pages/flights/flights' }) },
  goGuidebook() { wx.navigateTo({ url: '/pages/guidebook/guidebook' }) },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }) },
  onShareAppMessage() {
    return {
      title: '出发吧 GoTrip · 协作旅行规划',
      path: '/pages/home/home',
      imageUrl: '/assets/sanya.jpg'
    }
  }
})
