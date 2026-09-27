const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')

// store 账单 cat 键（car/bed/food/ticket/shop/show/note）→ 统计用中文名与色
const CAT_META = {
  car: { name: '交通', color: '#2FA96E' },
  bed: { name: '住宿', color: '#2BB8A8' },
  food: { name: '餐饮', color: '#FFC414' },
  ticket: { name: '门票', color: '#2E92ED' },
  shop: { name: '购物', color: '#FF8A5C' },
  show: { name: '娱乐', color: '#7B8CFF' },
  note: { name: '其他', color: '#93A5B8' }
}
// 弹层分类（游玩写入时归到「娱乐」）→ store.addBill 的 category 白名单
const CAT_TO_STORE = {
  '餐饮': '餐饮', '住宿': '住宿', '交通': '交通',
  '门票': '门票', '游玩': '娱乐', '购物': '购物'
}
// 账单行图标：store cat 中 shop/show 无对应图标类，映射到现有图标
const CAT_ICON = {
  car: 'car', bed: 'bed', food: 'food', ticket: 'ticket',
  shop: 'wallet', show: 'star', note: 'note'
}
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

Page({
  data: {
    themeClass: '', loading: true, noTrip: false,
    sheet: false, saving: false, amount: '', catIdx: 0, payerIdx: 0, keys: KEYS,
    sheetDate: '',
    cats: [
      { name: '餐饮', icon: 'food' }, { name: '住宿', icon: 'bed' }, { name: '交通', icon: 'car' },
      { name: '门票', icon: 'ticket' }, { name: '游玩', icon: 'camera' }, { name: '购物', icon: 'wallet' }
    ],
    payers: [],
    // 预算与统计（引擎计算）
    totalSpent: 0, budgetTotal: 0, budgetPct: 0, perPerson: 0,
    catStats: [],
    balances: [],
    billList: []
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
      this.refresh()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  today() {
    const d = new Date()
    const p = x => String(x).padStart(2, '0')
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  },
  fmtDay(s) {
    return s ? String(s).slice(5).replace('-', '.') : ''
  },
  refresh() {
    const members = store.members || []
    const raw = store.bills || []
    // sharers 为空时按全员均摊，避免引擎除零
    const bills = raw.map(b => ({ ...b, sharers: (b.sharers && b.sharers.length) ? b.sharers : members.map((_, i) => i) }))
    const totalSpent = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
    // 分类统计（按金额降序 + 占比条）
    const byCat = {}
    bills.forEach(b => { byCat[b.cat] = (byCat[b.cat] || 0) + (Number(b.amount) || 0) })
    const catStats = Object.keys(byCat)
      .map(cat => ({
        name: (CAT_META[cat] || { name: '其他' }).name,
        color: (CAT_META[cat] || { color: '#93A5B8' }).color,
        amount: byCat[cat],
        pct: totalSpent ? Math.round(byCat[cat] / totalSpent * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount)
    // 成员结余（引擎：最少转账结算的中间量）
    const balances = []
    if (members.length) {
      const res = bills.length ? engine.settle(bills, members) : { balances: members.map(() => 0) }
      members.forEach((m, i) => {
        const v = res.balances[i] || 0
        balances.push({
          name: m.name, initial: m.initial, av: m.av,
          val: (v >= 0 ? '+¥' : '-¥') + Math.abs(v),
          neg: v < 0
        })
      })
    }
    const billList = bills.map(b => {
      const m = members[b.payerIdx] || members[0] || {}
      return {
        ...b,
        dayTxt: this.fmtDay(b.day),
        catIcon: CAT_ICON[b.cat] || 'note',
        payer: m.name || '—', payerInitial: m.initial || '?', payerAv: m.av || 'av-blue',
        split: (b.splitN || members.length || 1) + ' 人均摊',
        amountTxt: '¥' + b.amount
      }
    })
    const budgetTotal = (store.trip && store.trip.budgetTotal) || 0
    this.setData({
      loading: false,
      totalSpent, catStats, balances, billList,
      payers: members,
      budgetTotal,
      perPerson: members.length ? Math.round(totalSpent / members.length) : 0,
      budgetPct: budgetTotal ? Math.min(100, Math.round(totalSpent / budgetTotal * 100)) : 0
    })
  },
  openSheet() {
    if (!this.data.payers.length) { wx.showToast({ title: '暂无成员信息', icon: 'none' }); return }
    this.setData({ sheet: true, amount: '', catIdx: 0, payerIdx: 0, sheetDate: this.fmtDay(this.today()) })
  },
  goSettle() { wx.navigateTo({ url: '/pages/settle/settle' }) },
  closeSheet() { this.setData({ sheet: false }) },
  setCat(e) { this.setData({ catIdx: Number(e.currentTarget.dataset.i) }) },
  setPayer(e) { this.setData({ payerIdx: Number(e.currentTarget.dataset.i) }) },
  pressKey(e) {
    const k = e.currentTarget.dataset.k
    let a = this.data.amount
    if (k === 'del') a = a.slice(0, -1) || '0'
    else if (k === '.') { if (a.indexOf('.') < 0) a += '.' }
    else if (a.replace('.', '').length < 7) a = (a === '0' && k !== '.') ? k : a + k
    this.setData({ amount: a })
  },
  async save() {
    if (this.data.saving) return
    const amount = Number(this.data.amount)
    if (!amount || amount <= 0) { wx.showToast({ title: '请输入金额', icon: 'none' }); return }
    const members = store.members || []
    const payer = members[this.data.payerIdx]
    if (!payer) { wx.showToast({ title: '请选择垫付人', icon: 'none' }); return }
    const cat = this.data.cats[this.data.catIdx]
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      await store.addBill({
        title: cat.name + ' · 快速记账',
        amount,
        category: CAT_TO_STORE[cat.name] || '其他',
        payerMemberId: payer.id,
        date: this.today(),
        participants: members.map(m => m.id)
      })
      await store.reload()
      wx.hideLoading()
      this.setData({ sheet: false, saving: false })
      this.refresh()
      wx.showToast({ title: '已记 ¥' + amount + '（' + payer.name + '垫付）', icon: 'none' })
    } catch (e) {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: (e && e.message) || '保存失败，请重试', icon: 'none' })
    }
  },
  delBill(e) {
    const { id, title } = e.currentTarget.dataset
    if (!id) return
    wx.showModal({
      title: '删除这笔账单？',
      content: (title || '') + '\n删除后各成员结余将重新计算',
      confirmColor: '#F0655A',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await store.deleteBillById(id, title)
          await store.reload()
          wx.hideLoading()
          this.refresh()
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
