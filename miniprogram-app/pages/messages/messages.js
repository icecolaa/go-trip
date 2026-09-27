const store = require('../../utils/store')
const theme = require('../../utils/theme')

Page({
  data: {
    themeClass: '',
    loading: true,
    needTrip: false, // 无当前行程时的空态
    feed: [],
    tripTitle: '',
    tripCover: '/assets/yichun-road.jpg'
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
    } catch (e) {
      this.setData({ loading: false, needTrip: true, feed: [] })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
      return
    }
    if (!store.trip) {
      this.setData({ loading: false, needTrip: true, feed: [], tripTitle: '' })
      return
    }
    this.setData({
      loading: false,
      needTrip: false,
      feed: store.feed || [],
      tripTitle: store.trip.title || '',
      tripCover: store.trip.coverImage || this.data.tripCover
    })
  },
  onPullDownRefresh() {
    if (!store.trip) { wx.stopPullDownRefresh(); return }
    store.reloadFeedOnly()
      .then(() => this.setData({ feed: store.feed || [] }))
      .catch((e) => wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' }))
      .then(() => wx.stopPullDownRefresh())
  },
  goOverview() { wx.navigateTo({ url: '/pages/overview/overview' }) },
  goHome() { wx.switchTab({ url: '/pages/home/home' }) }
})
