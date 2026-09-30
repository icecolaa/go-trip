const theme = require('../../utils/theme')
const store = require('../../utils/store')

const KIND_TXT = {
  attraction: '景点', food: '美食', hotel: '住宿', shop: '购物', other: '地点'
}

Page({
  data: {
    themeClass: '',
    loading: true,
    hasTrip: false,
    city: '',
    places: [],
    placeCount: 0,
    candidateCount: 0,
    days: []
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
        this.setData({ loading: false, hasTrip: false, places: [] })
        return
      }
      try { await store.reloadPlaces() } catch (e) { /* 列表刷新失败不阻断 */ }
      this.setData({
        loading: false,
        hasTrip: true,
        city: t.city || t.destination || '',
        days: t.days || []
      })
      this.refresh()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  refresh() {
    // 装饰性配图按序循环（仅占位，无业务含义）
    const DECOR = ['/assets/forest-trail.jpg', '/assets/yichun-lake.jpg', '/assets/yichun-road.jpg', '/assets/dali.jpg']
    const places = (store.places || []).map((p, i) => ({
      id: p.id,
      rank: i + 1,
      name: p.name,
      img: DECOR[i % DECOR.length],
      desc: p.address || p.city || '',
      t1: KIND_TXT[p.kind] || '地点',
      t2: p.city || '',
      t3: p.candidate ? '候选' : '已排入行程',
      t3c: p.candidate ? 'yellow' : 'green',
      footTxt: p.note || (p.candidate ? '待安排' : '已在日程中'),
      candidate: !!p.candidate
    }))
    this.setData({
      places,
      placeCount: places.length,
      candidateCount: places.filter(p => p.candidate).length
    })
  },
  // 添加候选地点：统一弹层输入名称
  onAdd() {
    this.setData({
      addSheet: {
        show: true,
        fields: [{ key: 'name', label: '地点名称', placeholder: '输入地点名称（如：茅兰沟）', required: true, maxlength: 30 }]
      }
    })
  },
  closeAddSheet() { this.setData({ 'addSheet.show': false }) },
  async onAddSheet(e) {
    this.setData({ 'addSheet.show': false })
    try {
      await store.addPlace({ name: e.detail.name })
      wx.showToast({ title: '已加入候选', icon: 'success' })
      this.refresh()
    } catch (err) {
      wx.showToast({ title: '添加失败，请重试', icon: 'none' })
    }
  },
  // 删除候选地点（长按或按钮）→ 确认
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const p = store.places.find(x => x.id === id)
    if (!p) return
    wx.showModal({
      title: '删除候选地点',
      content: '确定删除「' + p.name + '」吗？',
      confirmColor: '#E4572E',
      success: async res => {
        if (!res.confirm) return
        try {
          await store.deletePlaceById(id)
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (err) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
        this.refresh()
      }
    })
  },
  // 加入行程：选天 → 写入日程（sight + place）
  onAddToTrip(e) {
    const id = e.currentTarget.dataset.id
    const p = store.places.find(x => x.id === id)
    if (!p) return
    const days = this.data.days
    if (!days.length) { wx.showToast({ title: '行程还没有日期', icon: 'none' }); return }
    wx.showActionSheet({
      itemList: days.map(d => 'D' + d.d + ' · ' + d.date),
      success: async res => {
        const target = days[res.tapIndex]
        if (!target) return
        try {
          await store.addActivity(target.d, { title: p.name, kind: 'sight', place: p.name })
          wx.showToast({ title: '已加入 D' + target.d, icon: 'success' })
        } catch (err) {
          wx.showToast({ title: '加入失败，请重试', icon: 'none' })
        }
        this.refresh()
      }
    })
  },
  goSchedule() { wx.navigateBack({ delta: 1 }) }
})
