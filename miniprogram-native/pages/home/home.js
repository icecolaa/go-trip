const store = require("../../utils/store")
const theme = require("../../utils/theme")

function md(iso) {
  const p = (iso || '').split('-')
  if (p.length < 3) return ''
  return `${parseInt(p[1], 10)}月${parseInt(p[2], 10)}日`
}
function rangeText(s, e) {
  if (!s) return '日期待定'
  return e ? `${md(s)} – ${md(e)}` : md(s)
}
function greetWord() {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

Page({
  data: {
    themeClass: '',
    loading: true,
    refreshing: false,
    greet: greetWord(),
    sub: '',
    trips: []
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(0)
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      this.applyTrips()
      this.setData({ loading: false })
    } catch (e) {
      this.setData({ loading: false, trips: [] })
      wx.showToast({ title: (e && e.message) || '加载失败，请下拉重试', icon: 'none' })
    }
  },
  applyTrips() {
    const trips = (store.trips || []).map(t => ({
      id: t.id,
      title: t.title || '未命名旅程',
      destination: t.destination || '目的地待定',
      emoji: t.coverEmoji || '🧭',
      color: t.coverColor || '#2E92ED',
      range: rangeText(t.startDate, t.endDate),
      count: t.activityCount || 0
    }))
    this.setData({
      trips,
      greet: greetWord(),
      sub: trips.length ? `共 ${trips.length} 段旅程 · 点卡片继续规划` : '从一段旅程开始吧'
    })
  },
  /* 下拉刷新：页面级（enablePullDownRefresh）+ scroll-view refresher 共用 */
  onPullDownRefresh() { this.doRefresh(true) },
  onRefresherRefresh() {
    this.setData({ refreshing: true })
    this.doRefresh(false)
  },
  async doRefresh(stopPagePull) {
    try {
      await store.refreshTrips()
      this.applyTrips()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '刷新失败', icon: 'none' })
    } finally {
      if (stopPagePull) wx.stopPullDownRefresh()
      else if (this.data.refreshing) this.setData({ refreshing: false })
    }
  },
  openTrip(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    ;(async () => {
      try {
        wx.showLoading({ title: '整理中…', mask: true })
        store.setCurrentTrip(id)
        await store.loadTrip(id)
        wx.hideLoading()
        wx.navigateTo({ url: '/pages/overview/overview' })
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '打开行程失败', icon: 'none' })
      }
    })()
  },
  removeTrip(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.trips.find(t => t.id === id)
    if (!item) return
    wx.showModal({
      title: '删除旅程',
      content: `确定删除「${item.title}」吗？删除后不可恢复`,
      confirmText: '删除',
      confirmColor: '#F0655A',
      success: (res) => { if (res.confirm) this.doDelete(id) }
    })
  },
  async doDelete(id) {
    try {
      wx.showLoading({ title: '删除中…', mask: true })
      await store.deleteTripById(id)
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      this.applyTrips()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
    }
  },
  goCreate() { wx.navigateTo({ url: '/pages/create/create' }) },
  async importDemo() {
    if (this._importing) return
    this._importing = true
    try {
      wx.showLoading({ title: '整理中…', mask: true })
      await store.importDemo()
      wx.hideLoading()
      this.applyTrips()
      wx.showToast({ title: '演示行程已导入', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '导入失败', icon: 'none' })
    } finally {
      this._importing = false
    }
  }
})
