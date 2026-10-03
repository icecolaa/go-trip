const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')
const api = require('../../utils/api')
const entities = require('../../utils/rdb/entities')

const TYPE_ICONS = {
  '餐饮': 'food', '住宿': 'bed', '门票': 'ticket', '交通': 'car',
  '游玩': 'camera', '购物': 'wallet', '演出': 'star', '其他': 'note'
}
// 「＋安排」分类选择 → kind 映射
const CAT_ITEMS = ['交通', '住宿', '餐饮', '门票', '游玩', '购物', '演出', '其他']
const CAT_KINDS = ['transport', 'hotel', 'food', 'ticket', 'sight', 'shopping', 'show', 'other']

function hasCoord(s) { return s && s.lat != null && s.lng != null }

Page({
  data: {
    themeClass: '',
    loading: true,
    hasTrip: false,
    days: [],
    catItems: CAT_ITEMS,
    formShow: false,
    formDay: null,
    formTitle: '',
    formKindIdx: 0,
    formPlace: '',
    formLat: null,
    formLng: null,
    dayIdx: 0,
    dayStops: [],
    dayCost: 0
  },
  /* 从总览天卡跳入：?day=N 定位到对应天（消费一次即清，返回再进不重定位） */
  onLoad(options) {
    const d = Number(options && options.day)
    if (d > 0) this._pendingDay = d
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      const t = store.trip
      if (!t) {
        this.setData({ loading: false, hasTrip: false, days: [], dayStops: [], dayCost: 0 })
        return
      }
      const days = t.days || []
      let dayIdx = Math.min(this.data.dayIdx, Math.max(0, days.length - 1))
      if (this._pendingDay) {
        const idx = days.findIndex(x => x.d === this._pendingDay)
        if (idx >= 0) dayIdx = idx
        this._pendingDay = 0
      }
      this.setData({ loading: false, hasTrip: true, days, dayIdx })
      this.refresh()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  refresh() {
    const days = this.data.days
    if (!days.length || !store.trip) {
      this.setData({ dayStops: [], dayCost: 0 })
      return
    }
    const day = days[this.data.dayIdx].d
    const list = store.stops.filter(s => s.day === day)
      .slice().sort((a, b) => (a.time < b.time ? -1 : 1))
    // 站间距离估算（engine.legEstimate，仅两侧都有坐标时）
    const enriched = list.map((s, i) => ({
      ...s,
      icon: TYPE_ICONS[s.type] || 'pin',
      leg: i === 0 || !hasCoord(list[i - 1]) || !hasCoord(s) ? '' : (function () {
        const est = engine.legEstimate(list[i - 1], s)
        return '约 ' + est.km + ' km · 车程 ' + est.min + ' 分钟'
      })()
    }))
    this.setData({
      dayStops: enriched,
      dayCost: list.reduce((sum, s) => sum + (s.cost || 0), 0)
    })
  },
  pickDay(e) { this.setData({ dayIdx: Number(e.currentTarget.dataset.i) }, () => this.refresh()) },
  stopMenu(e) {
    const id = e.currentTarget.dataset.id
    const name = (this.data.dayStops.find(s => s.id === id) || {}).name || ''
    wx.showActionSheet({
      itemList: ['上移', '下移', '修改备注', '移动到其他天', '删除安排'],
      success: res => {
        if (res.tapIndex === 0) this.shift(id, -1)
        if (res.tapIndex === 1) this.shift(id, 1)
        if (res.tapIndex === 2) this.editNote(id)
        if (res.tapIndex === 3) this.moveDay(id)
        if (res.tapIndex === 4) this.delStop({ currentTarget: { dataset: { id, name } } })
      }
    })
  },
  /** 删除单条安排（级联清活动+动态日志）：stopMenu 第五项，也可被自动化脚本直驱 */
  delStop(e) {
    const { id, name } = e.currentTarget.dataset
    if (!id) return
    wx.showModal({
      title: '删除安排',
      content: `确定删除「${name || '该安排'}」吗？`,
      confirmText: '删除',
      confirmColor: '#F0655A',
      success: async (r) => {
        if (!r.confirm) return
        try {
          wx.showLoading({ title: '删除中…', mask: true })
          await store.deleteActivityById(id, name)
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (e2) {
          wx.hideLoading()
          wx.showToast({ title: (e2 && e2.message) || '删除失败', icon: 'none' })
        }
        this.refresh()
      }
    })
  },
  async shift(id, dir) {
    const days = this.data.days
    if (!days.length) return
    const day = days[this.data.dayIdx].d
    const list = store.stops.filter(s => s.day === day).slice().sort((a, b) => (a.time < b.time ? -1 : 1))
    const i = list.findIndex(s => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) { wx.showToast({ title: '已到边缘', icon: 'none' }); return }
    try {
      await store.swapActivityTimes(id, list[j].id) // 写穿透（内部已重拉）
      wx.showToast({ title: dir < 0 ? '已上移' : '已下移', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: '排序失败，请重试', icon: 'none' })
    }
    this.refresh()
  },
  editNote(id) {
    const s = store.stops.find(x => x.id === id)
    if (!s) return
    this._noteId = id
    this.setData({
      noteSheet: {
        show: true,
        title: s.name + ' · 备注',
        fields: [{ key: 'note', label: '备注', placeholder: s.note || '填写备注（如：需要预约）', value: s.note || '', type: 'textarea', maxlength: 100 }]
      }
    })
  },
  closeNoteSheet() { this.setData({ 'noteSheet.show': false }) },
  async onNoteSheet(e) {
    this.setData({ 'noteSheet.show': false })
    try {
      await store.updateActivity(this._noteId, { notes: e.detail.note || '' })
      wx.showToast({ title: '备注已更新', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    this.refresh()
  },
  moveDay(id) {
    const s = store.stops.find(x => x.id === id)
    if (!s) return
    const others = this.data.days.filter(d => d.d !== s.day)
    if (!others.length) { wx.showToast({ title: '没有其他天可移动', icon: 'none' }); return }
    wx.showActionSheet({
      itemList: others.map(d => 'D' + d.d + ' · ' + d.date),
      success: async res => {
        const target = others[res.tapIndex]
        if (!target) return
        try {
          await store.moveActivityToDay(id, target.d) // 写穿透（内部已重拉）
          wx.showToast({ title: '已移至 ' + target.date, icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '移动失败，请重试', icon: 'none' })
        }
        this.refresh()
      }
    })
  },
  // 「＋安排」：底部弹层表单（名称 / 分类 / 地点 / 地图选点）
  addPlan() {
    const days = this.data.days
    if (!days.length) return
    const cur = days[this.data.dayIdx]
    this.setData({
      formShow: true,
      formDay: cur,
      formTitle: '',
      formKindIdx: CAT_ITEMS.indexOf('游玩') >= 0 ? CAT_ITEMS.indexOf('游玩') : 0,
      formPlace: '',
      formLat: null,
      formLng: null
    })
  },
  closeForm() { this.setData({ formShow: false }) },
  noop() { },
  onFormTitle(e) { this.setData({ formTitle: e.detail.value || '' }) },
  onFormPlace(e) {
    // 手动改地点文字时清掉旧选点坐标（文字与坐标须一致）
    this.setData({ formPlace: e.detail.value || '', formLat: null, formLng: null })
  },
  pickKind(e) { this.setData({ formKindIdx: Number(e.currentTarget.dataset.i) }) },
  chooseOnMap() {
    wx.chooseLocation({
      success: (r) => {
        if (!(r && (r.name || r.address))) return
        this.setData({
          formPlace: r.name || r.address || '',
          formLat: r.latitude,
          formLng: r.longitude
        })
      },
      fail: (e) => {
        if (e && /auth/.test(e.errMsg || '')) wx.showToast({ title: '未授权位置，请到设置开启', icon: 'none' })
      }
    })
  },
  async saveForm() {
    if (this._saving) return
    const { formDay, formTitle, formKindIdx, formPlace, formLat, formLng } = this.data
    const title = (formTitle || '').trim()
    if (!title) { wx.showToast({ title: '请填写安排名称', icon: 'none' }); return }
    this._saving = true
    try {
      const payload = { title, kind: CAT_KINDS[formKindIdx] || 'other', place: (formPlace || '').trim() }
      if (formLat != null && formLng != null) { payload.lat = formLat; payload.lng = formLng }
      await store.addActivity(formDay.d, payload) // 写穿透（内部已重拉）
      this.setData({ formShow: false })
      wx.showToast({ title: '已添加到 D' + formDay.d, icon: 'success' })
      // 未选点但填了地点文字：后台地理编码兜底（容器高德），不阻塞
      if (formLat == null && payload.place) {
        const row = [...(store.stops || [])].reverse().find(s => s.name === title && s.lat == null)
        if (row) this.geocodeOne(payload.place, row.id)
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '添加失败，请重试', icon: 'none' })
    } finally {
      this._saving = false
    }
    this.refresh()
  },
  /** 单条兜底编码：命中即落库（复用地图页同款容器接口） */
  async geocodeOne(place, actId) {
    try {
      const geo = await api.post('/api/poi/geocode', {
        items: [{ id: actId, query: String(place).replace(/^(穿越|游览|前往|到达|入住|返回|集合)/, '').slice(0, 30), city: (store.trip && store.trip.city) || '' }]
      })
      const c = geo.coords && geo.coords[actId]
      if (c) {
        await entities.updateRow('gt_activities', actId, { lat: c.lat, lng: c.lng })
        // 同步内存：store.stops 是 refresh 的数据源，只写库不更新内存则坐标永远刷不出
        const row = (store.stops || []).find(s => s.id === actId)
        if (row) { row.lat = c.lat; row.lng = c.lng }
        setTimeout(() => this.refresh(), 1500)
      }
    } catch (e) { /* 兜底失败静默：地图页进入时会再自动编码一次 */ }
  },
  goTripMode() { wx.switchTab({ url: '/pages/trip-mode/trip-mode' }) },
  goMap() { wx.navigateTo({ url: '/pages/map/map' }) },
  addPlace() { wx.navigateTo({ url: '/pages/places/places' }) }
})
