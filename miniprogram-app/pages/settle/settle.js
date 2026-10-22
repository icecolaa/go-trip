const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')

Page({
  data: {
    themeClass: '', loading: true, noTrip: false, done: 0,
    totalSpent: 0, perPerson: 0, naive: 0,
    transfers: [],        // store.minimalTransfers 算出的最少转账方案
    details: []           // 每人收支明细
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      if (!store.trip || !store.trip.id) { this.setData({ loading: false, noTrip: true }); return }
      this.setData({ noTrip: false })
      this.compute()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  memberByName(name) {
    return (store.members || []).find(m => m.name === name) || null
  },
  compute() {
    const members = store.members || []
    const raw = store.bills || []
    // sharers 为空时按全员均摊，避免引擎除零
    const bills = raw.map(b => ({ ...b, sharers: (b.sharers && b.sharers.length) ? b.sharers : members.map((_, i) => i) }))
    const totalSpent = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
    const res = members.length ? engine.settle(bills, members) : { balances: [], transfers: [] }
    const details = members.map((m, i) => {
      const paid = bills.filter(b => b.payerIdx === i).reduce((s, b) => s + (Number(b.amount) || 0), 0)
      const owed = members.length ? Math.round(totalSpent / members.length * 10) / 10 : 0
      const v = res.balances[i] || 0
      return {
        name: m.role === 'owner' ? m.name + '（我）' : m.name,
        initial: m.initial, av: m.av,
        calc: '垫付 ¥' + paid + ' · 应摊 ¥' + owed,
        net: (v >= 0 ? '+¥' : '-¥') + Math.abs(v),
        neg: v < 0
      }
    })
    // 最少转账方案（store 结算引擎，输出 [{from,to,amount}]）
    const transfers = store.minimalTransfers().map((t, i) => {
      const from = this.memberByName(t.from) || {}
      const to = this.memberByName(t.to) || {}
      return {
        id: i,
        from: t.from, fromInitial: from.initial || (t.from || '?').slice(0, 1), fromAv: from.av || 'av-blue',
        to: t.to, toInitial: to.initial || (t.to || '?').slice(0, 1), toAv: to.av || 'av-blue',
        amount: '¥' + t.amount, note: '应付 − 已垫', paid: false
      }
    })
    // 少转笔数 = 全员两两结清的笔数 - 方案笔数
    const naive = members.length * (members.length - 1) / 2
    this.setData({
      loading: false,
      totalSpent,
      perPerson: members.length ? Math.round(totalSpent / members.length * 10) / 10 : 0,
      transfers,
      details,
      naive
    })
  },
  togglePaid(e) {
    const id = Number(e.currentTarget.dataset.id)
    const transfers = this.data.transfers.map(t => t.id === id ? { ...t, paid: !t.paid } : t)
    this.setData({ transfers, done: transfers.filter(t => t.paid).length })
  },
  export() { wx.showToast({ title: '导出功能准备中', icon: 'none' }) },
  remind() { wx.showToast({ title: '提醒功能准备中', icon: 'none' }) },
  onShareAppMessage() {
    return { title: '行程账单 · 结算方案', path: '/pages/settle/settle', imageUrl: '/assets/share-cover.jpg' }
  }
})
