const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')

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
    dayIdx: 0,
    dayStops: [],
    dayCost: 0
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
      const dayIdx = Math.min(this.data.dayIdx, Math.max(0, days.length - 1))
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
    wx.showActionSheet({
      itemList: ['上移', '下移', '修改备注', '移动到其他天'],
      success: res => {
        if (res.tapIndex === 0) this.shift(id, -1)
        if (res.tapIndex === 1) this.shift(id, 1)
        if (res.tapIndex === 2) this.editNote(id)
        if (res.tapIndex === 3) this.moveDay(id)
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
    wx.showModal({
      title: s.name + ' · 备注',
      editable: true,
      placeholderText: s.note || '填写备注（如：需要预约）',
      success: async res => {
        if (!res.confirm) return
        try {
          await store.updateActivity(id, { notes: res.content || '' })
          wx.showToast({ title: '备注已更新', icon: 'none' })
        } catch (e) {
          wx.showToast({ title: '保存失败，请重试', icon: 'none' })
        }
        this.refresh()
      }
    })
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
  // 「＋安排」：输入标题 → 选分类 → 写入当天
  addPlan() {
    const days = this.data.days
    if (!days.length) return
    const cur = days[this.data.dayIdx]
    wx.showModal({
      title: '安排 · D' + cur.d + ' ' + cur.date,
      editable: true,
      placeholderText: '输入安排名称（如：酒店入住）',
      success: res => {
        const title = (res.content || '').trim()
        if (!res.confirm || !title) return
        wx.showActionSheet({
          itemList: CAT_ITEMS,
          success: r => {
            const kind = CAT_KINDS[r.tapIndex] || 'other'
            this.doAdd(title, kind)
          }
        })
      }
    })
  },
  async doAdd(title, kind) {
    const days = this.data.days
    if (!days.length) return
    const day = days[this.data.dayIdx].d
    try {
      await store.addActivity(day, { title, kind }) // 写穿透（内部已重拉）
      wx.showToast({ title: '已添加到 D' + day, icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '添加失败，请重试', icon: 'none' })
    }
    this.refresh()
  },
  goTripMode() { wx.switchTab({ url: '/pages/trip-mode/trip-mode' }) },
  goMap() { wx.navigateTo({ url: '/pages/map/map' }) },
  addPlace() { wx.navigateTo({ url: '/pages/places/places' }) }
})
