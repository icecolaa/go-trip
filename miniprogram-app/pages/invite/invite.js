const store = require('../../utils/store')
const theme = require("../../utils/theme")
const ops = require('../../utils/rdb/ops')

const PALETTE = ['#2E92ED', '#FFC414', '#2FA96E', '#FF8A5C', '#7B8CFF', '#2BB8A8']

function md(iso) {
  const p = (iso || '').split('-')
  if (p.length < 3) return ''
  return `${parseInt(p[1], 10)}月${parseInt(p[2], 10)}日`
}

function vm(rows) {
  // 与 store.memberVM 同构：名字/首字/头像色轮转
  return (rows || []).map((m, i) => ({
    id: m.id,
    name: m.displayName || '同伴',
    initial: (m.displayName || '?').slice(0, 1),
    av: store.avClass(m.avatarColor, m.displayName),
    color: m.avatarColor || PALETTE[i % PALETTE.length],
  }))
}

Page({
  data: {
    themeClass: '',
    ready: false,
    empty: false, // 未选定行程（未从首页进入）
    tripTitle: '',
    range: '',
    memberCount: 0,
    coverEmoji: '🧭',
    coverColor: '#2E92ED',
    members: [],
    newName: ''
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
    const t = store.trip
    if (!t) {
      this.setData({ ready: true, empty: true })
      return
    }
    const range = t.start && t.endDate ? `${md(t.start)} – ${md(t.endDate)}` : (md(t.start) || '日期待定')
    this.setData({
      ready: true,
      empty: false,
      tripTitle: t.title || '未命名旅程',
      range,
      coverEmoji: t.coverEmoji || '🧭',
      coverColor: t.coverColor || '#2E92ED'
    })
    await this.refreshMembers()
  },
  async refreshMembers() {
    const t = store.trip
    if (!t) return
    try {
      const rows = await ops.listMembers(t.id)
      const members = vm(rows)
      // 同步内存态：overview 成员条 / 分账 / 指派都读这里
      store.members = members
      if (store.trip) store.trip.members = members
      this.setData({ members, memberCount: members.length })
    } catch (e) {
      this.setData({ members: store.members || [], memberCount: (store.members || []).length })
    }
  },
  /* ---- 添加 ---- */
  onNewName(e) { this.setData({ newName: e.detail.value || '' }) },
  async addMember() {
    const t = store.trip
    const name = (this.data.newName || '').trim().slice(0, 20)
    if (!t) return
    if (!name) { wx.showToast({ title: '先填写同伴称呼', icon: 'none' }); return }
    if ((this.data.members || []).length >= 12) { wx.showToast({ title: '最多 12 位同伴', icon: 'none' }); return }
    try {
      const m = await ops.createMember(t.id, name, '我')
      // 头像色轮转（createMember 默认单色）
      const color = PALETTE[(this.data.members || []).length % PALETTE.length]
      await ops.updateMember(t.id, m.id, { avatar_color: color }, '我').catch(() => { })
      this.setData({ newName: '' })
      await this.refreshMembers()
      wx.showToast({ title: '已添加', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '添加失败', icon: 'none' })
    }
  },
  /* ---- 改名 ---- */
  renameMember(e) {
    const t = store.trip
    const { id, name } = e.currentTarget.dataset
    if (!t || !id) return
    wx.showModal({
      title: '修改称呼',
      editable: true,
      placeholderText: name || '同伴称呼',
      success: async (r) => {
        if (!r.confirm) return
        const name2 = (r.content || '').trim().slice(0, 20)
        if (!name2) { wx.showToast({ title: '称呼不能为空', icon: 'none' }); return }
        try {
          await ops.updateMember(t.id, id, { displayName: name2 }, '我')
          await this.refreshMembers()
          wx.showToast({ title: '已修改', icon: 'success' })
        } catch (e2) {
          wx.showToast({ title: (e2 && e2.message) || '修改失败', icon: 'none' })
        }
      }
    })
  },
  /* ---- 删除（长按） ---- */
  removeMember(e) {
    const t = store.trip
    const { id, name } = e.currentTarget.dataset
    if (!t || !id) return
    wx.showModal({
      title: '移除同伴',
      content: `确定移除「${name}」吗？其分账与指派将回到未分配`,
      confirmText: '移除',
      confirmColor: '#F0655A',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await ops.deleteMember(t.id, id, name, '我')
          await this.refreshMembers()
          wx.showToast({ title: '已移除', icon: 'success' })
        } catch (e2) {
          wx.showToast({ title: (e2 && e2.message) || '移除失败', icon: 'none' })
        }
      }
    })
  },
  onShareAppMessage() {
    // onShareAppMessage 可能早于 ready 触发，fail-soft 兜底
    const t = store.trip || null
    const title = ((t && t.title) || '出发吧 GoTrip') + ' · 和朋友一起把旅行计划成真'
    return {
      title,
      path: '/pages/home/home'
    }
  },
  goHome() {
    wx.switchTab({
      url: '/pages/home/home',
      fail() { wx.showToast({ title: '跳转失败，请重试', icon: 'none' }) }
    })
  },
  close() { wx.navigateBack({ delta: 1, fail: () => this.goHome() }) }
})
