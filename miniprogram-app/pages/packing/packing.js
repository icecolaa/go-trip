const store = require('../../utils/store')
const theme = require('../../utils/theme')

// 内置中国出行模板（本地模板，导入后写入清单）
const TEMPLATE = [
  { name: '证件', items: [
    { name: '身份证', qty: 1 }, { name: '驾驶证', qty: 1, note: '自驾备查' }, { name: '现金 + 银行卡', qty: 1 }
  ]},
  { name: '衣物', items: [
    { name: '防风外套', qty: 1, note: '林区早晚近 0°C' }, { name: '毛衣 / 抓绒', qty: 2 }, { name: '长裤', qty: 2 },
    { name: '保暖内衣', qty: 2 }, { name: '帽子手套', qty: 1 }
  ]},
  { name: '电子', items: [
    { name: '相机 + 备用电池', qty: 1 }, { name: '充电宝', qty: 1, note: '≤20000mAh 可上飞机' }, { name: '车充', qty: 1 }, { name: '三脚架', qty: 1 }
  ]},
  { name: '洗护', items: [
    { name: '防晒霜 SPF50+', qty: 1 }, { name: '洗漱包', qty: 1 }, { name: '湿巾 / 纸巾', qty: 2 }
  ]},
  { name: '药品', items: [
    { name: '感冒药 / 肠胃药', qty: 1 }, { name: '创可贴', qty: 1 }, { name: '驱蚊液', qty: 1 }
  ]}
]

// 分类 → 图标/颜色（与清单分组展示一致）
const GROUP_META = {
  '证件': { icon: 'key', color: '#2E92ED' },
  '衣物': { icon: 'user', color: '#7B8CFF' },
  '电子': { icon: 'camera', color: '#2BB8A8' },
  '洗护': { icon: 'note', color: '#FF8A5C' },
  '药品': { icon: 'check', color: '#2FA96E' },
  '其他': { icon: 'note', color: '#93A5B8' }
}
const GROUP_ORDER = ['证件', '衣物', '电子', '洗护', '药品', '其他']
const CATEGORIES = GROUP_ORDER

Page({
  data: { themeClass: '', loading: true, noTrip: false, groups: [], doneCount: 0, totalCount: 0, progress: 0 },
  onShow() { this.setData({ themeClass: theme.currentClass() }); this.boot() },
  async boot() {
    try {
      await store.ready()
      if (!store.trip || !store.trip.id) { this.setData({ loading: false, noTrip: true }); return }
      this.setData({ noTrip: false })
      this.refresh()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  refresh() {
    const rows = store.packing || []
    const groups = GROUP_ORDER.map(cat => ({
      name: cat, icon: GROUP_META[cat].icon, color: GROUP_META[cat].color, items: []
    }))
    const byName = {}
    groups.forEach(g => { byName[g.name] = g })
    rows.forEach(r => {
      const cat = byName[r.category] ? r.category : '其他'
      byName[cat].items.push({
        id: r.id, name: r.title, qty: r.quantity || 1, note: r.note || '', done: !!r.done
      })
    })
    const shown = groups.filter(g => g.items.length)
    let total = 0, done = 0
    shown.forEach(g => g.items.forEach(it => { total++; if (it.done) done++ }))
    /* 手风琴：默认展开第一组、其余收起；_openCats 保持用户已展开状态（1.5.28） */
    if (!this._openCats) {
      this._openCats = {}
      if (shown.length) this._openCats[shown[0].name] = true
    }
    shown.forEach(g => { g.open = !!this._openCats[g.name] })
    console.log('[DBG] refresh _openCats =', JSON.stringify(this._openCats), '| groups =', JSON.stringify(shown.map(g => ({ n: g.name, open: g.open }))))
    this.setData({
      loading: false, groups: shown,
      totalCount: total, doneCount: done,
      progress: total ? Math.round(done / total * 100) : 0
    })
  },
  countProgress(groups) {
    let total = 0, done = 0
    groups.forEach(g => g.items.forEach(it => { total++; if (it.done) done++ }))
    return { total, done, progress: total ? Math.round(done / total * 100) : 0 }
  },
  async toggleItem(e) {
    const id = e.currentTarget.dataset.id
    const cur = this.findDone(this.data.groups, id)
    const newDone = !cur
    const groups = this.data.groups.map(g => ({ ...g, items: g.items.map(it => it.id === id ? { ...it, done: newDone } : it) }))
    // 乐观更新本地展示
    const p = this.countProgress(groups)
    this.setData({ groups, totalCount: p.total, doneCount: p.done, progress: p.progress })
    try {
      await store.togglePackingItem(id, newDone)
      // 同步内存行，避免下次 onShow 读到旧值
      const row = (store.packing || []).find(r => r.id === id)
      if (row) row.done = newDone
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '同步失败，已恢复', icon: 'none' })
      try { await store.reload() } catch (e2) { /* 忽略 */ }
      this.refresh()
    }
  },
  findDone(groups, id) {
    for (const g of groups) {
      const it = g.items.find(x => x.id === id)
      if (it) return it.done
    }
    return false
  },
  delItem(e) {
    const id = e.currentTarget.dataset.id
    let name = ''
    this.data.groups.forEach(g => g.items.forEach(it => { if (it.id === id) name = it.name }))
    if (!id) return
    wx.showModal({
      title: '删除「' + (name || '该物品') + '」？', content: '删除后不可恢复', confirmColor: '#F0655A',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await store.deletePackingById(id)
          wx.hideLoading()
          this.refresh()
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      }
    })
  },
  /* 分类头点击：展开/收起该组（1.5.28） */
  toggleGroup(e) {
    const name = e.currentTarget.dataset.name
    const cur = !!this._openCats[name]
    this._openCats[name] = !cur
    const idx = this.data.groups.findIndex(g => g.name === name)
    if (idx >= 0) this.setData({ ['groups[' + idx + '].open']: !cur })
  },
  addItem() {
    this.setData({
      itemSheet: {
        show: true,
        fields: [
          { key: 'title', label: '物品名称', placeholder: '如：晕车药', required: true, maxlength: 30 },
          { key: 'cat', label: '分类（可选）', placeholder: CATEGORIES.join(' / ') + '（留空为其他）', maxlength: 12 }
        ]
      }
    })
  },
  closeItemSheet() { this.setData({ 'itemSheet.show': false }) },
  onItemSheet(e) {
    this.setData({ 'itemSheet.show': false })
    const raw = e.detail.cat || ''
    const cat = CATEGORIES.indexOf(raw) >= 0 ? raw : '其他'
    this._openCats = this._openCats || {}
    this._openCats[cat] = true
    this.importItems([{ title: e.detail.title, category: cat }])
  },
  importTemplate() {
    const rows = store.packing || []
    const exist = {}
    rows.forEach(r => { exist[(r.title || '').trim()] = true })
    const items = []
    TEMPLATE.forEach(g => g.items.forEach(it => {
      const key = it.name.trim()
      if (!exist[key]) { items.push({ title: it.name, category: g.name }); exist[key] = true }
    }))
    if (!items.length) { wx.showToast({ title: '模板物品都已在清单里', icon: 'none' }); return }
    this.importItems(items)
  },
  async importItems(items) {
    wx.showLoading({ title: '整理中', mask: true })
    try {
      await store.addPackingItems(items)
      wx.hideLoading()
      this.refresh()
      wx.showToast({ title: '已添加 ' + items.length + ' 件', icon: 'none' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '添加失败，请重试', icon: 'none' })
    }
  }
})
