const store = require("../../utils/store")
const theme = require("../../utils/theme")
const storage = require("../../utils/rdb/storage")

const EMOJIS = ['🧭', '🗺️', '⛰️', '🏝️', '🏖️', '🏕️', '🎡', '🚗', '✈️', '🚄', '⛵', '🌴']
const COLORS = ['#2E92ED', '#FFC414', '#2FA96E', '#FF8A5C', '#7B8CFF', '#2BB8A8']
// fileID → 临时链接缓存（列表封面图换链，避免每次 onShow 重复请求）
const coverUrlCache = {}

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
    trips: [],
    emojis: EMOJIS,
    colors: COLORS,
    editShow: false,
    editTarget: null, // {id, title, coverEmoji, coverColor, hasImage}
    editTitle: '',
    editEmoji: EMOJIS[0],
    editColor: COLORS[0]
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
    const list = store.trips || []
    /* 封面图 fileID → 临时链接（缓存命中跳过） */
    const pending = []
    for (const t of list) {
      if (t.coverImage && !coverUrlCache[t.coverImage]) pending.push(t.coverImage)
    }
    const finish = () => {
      const trips = list.map(t => ({
        id: t.id,
        title: t.title || '未命名旅程',
        destination: t.destination || '目的地待定',
        emoji: t.coverEmoji || '🧭',
        color: t.coverColor || '#2E92ED',
        image: t.coverImage ? (coverUrlCache[t.coverImage] || '') : '',
        range: rangeText(t.startDate, t.endDate),
        count: t.activityCount || 0
      }))
      this.setData({
        trips,
        greet: greetWord(),
        sub: trips.length ? `共 ${trips.length} 段旅程 · 点卡片继续规划` : '从一段旅程开始吧'
      })
    }
    if (pending.length) {
      storage.tempUrls(pending).then(map => {
        Object.assign(coverUrlCache, map)
        finish()
      }).catch(() => finish())
    } else {
      finish()
    }
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
    wx.showActionSheet({
      itemList: ['编辑标题与图标', '更换封面图', '删除旅程'],
      success: (res) => {
        if (res.tapIndex === 0) this.openEdit(item)
        else if (res.tapIndex === 1) this.changeCover(id)
        else if (res.tapIndex === 2) {
          wx.showModal({
            title: '删除旅程',
            content: `确定删除「${item.title}」吗？删除后不可恢复`,
            confirmText: '删除',
            confirmColor: '#F0655A',
            success: (r) => { if (r.confirm) this.doDelete(id) }
          })
        }
      }
    })
  },
  /* ---- 卡片编辑：标题 + 图标 + 封面色 ---- */
  openEdit(item) {
    const raw = (store.trips || []).find(t => t.id === item.id) || {}
    this.setData({
      editShow: true,
      editTarget: { id: item.id, hasImage: !!raw.coverImage },
      editTitle: raw.title || item.title || '',
      editEmoji: raw.coverEmoji || item.emoji || EMOJIS[0],
      editColor: raw.coverColor || item.color || COLORS[0]
    })
  },
  closeEdit() { this.setData({ editShow: false }) },
  noop() { },
  onEditTitle(e) { this.setData({ editTitle: (e.detail.value || '').slice(0, 60) }) },
  onEditEmoji(e) { this.setData({ editEmoji: e.currentTarget.dataset.em }) },
  onEditColor(e) { this.setData({ editColor: e.currentTarget.dataset.color }) },
  async saveEdit() {
    if (this._saving) return
    const { editTarget, editTitle, editEmoji, editColor } = this.data
    const title = (editTitle || '').trim()
    if (!title) { wx.showToast({ title: '请填写旅程名称', icon: 'none' }); return }
    this._saving = true
    try {
      wx.showLoading({ title: '保存中…', mask: true })
      await store.updateTripMeta(editTarget.id, { title, coverEmoji: editEmoji, coverColor: editColor })
      wx.hideLoading()
      this.closeEdit()
      this.applyTrips()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this._saving = false
    }
  },
  /* ---- 换封面图：选图 → 压缩 → 上传云存储 → 入库 ---- */
  changeCover(id) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const src = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!src) return
        try {
          wx.showLoading({ title: '上传中…', mask: true })
          let up = src
          try { const c = await wx.compressImage({ src, quality: 80 }); up = c.tempFilePath } catch (e) { /* 原图兜底 */ }
          const fileID = await storage.uploadImage(up, 'covers')
          await store.updateTripMeta(id, { coverImage: fileID })
          wx.hideLoading()
          this.applyTrips()
          wx.showToast({ title: '封面已更新', icon: 'success' })
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
        }
      }
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
