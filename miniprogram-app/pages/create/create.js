const store = require('../../utils/store')
const theme = require("../../utils/theme")

const EMOJIS = ['🧭', '🗺️', '⛰️', '🏝️', '🏖️', '🏕️', '🎡', '🚗', '✈️', '🚄', '⛵', '🌴']
const COLORS = ['#2E92ED', '#FFC414', '#2FA96E', '#FF8A5C', '#7B8CFF', '#2BB8A8']
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n) { return String(n).padStart(2, '0') }
function iso(offset) {
  const d = new Date()
  d.setDate(d.getDate() + (offset || 0))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function md(isoStr) {
  const p = (isoStr || '').split('-')
  if (p.length < 3) return '—'
  return `${parseInt(p[1], 10)}月${parseInt(p[2], 10)}日`
}
function weekCn(isoStr) {
  const d = new Date((isoStr || '') + 'T00:00:00')
  return isNaN(d.getTime()) ? '' : WEEK[d.getDay()]
}
function days(s, e) {
  if (!s || !e) return 0
  const a = new Date(s + 'T00:00:00'), b = new Date(e + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

Page({
  data: {
    themeClass: '',
    title: '',
    destination: '',
    budget: '',
    startDate: iso(7),
    endDate: iso(10),
    startCn: md(iso(7)),
    startWeek: weekCn(iso(7)),
    endCn: md(iso(10)),
    endWeek: weekCn(iso(10)),
    nights: 3,
    emojis: EMOJIS,
    colors: COLORS,
    emoji: EMOJIS[0],
    color: COLORS[0],
    submitting: false
  },
  onShow() { this.setData({ themeClass: theme.currentClass() }) },
  sync() {
    const { startDate, endDate } = this.data
    this.setData({
      startCn: md(startDate),
      startWeek: weekCn(startDate),
      endCn: md(endDate),
      endWeek: weekCn(endDate),
      nights: days(startDate, endDate)
    })
  },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onDestination(e) { this.setData({ destination: e.detail.value }) },
  onBudget(e) { this.setData({ budget: e.detail.value }) },
  onStart(e) {
    const v = e.detail.value
    const patch = { startDate: v }
    if (this.data.endDate && this.data.endDate < v) patch.endDate = v
    this.setData(patch, () => this.sync())
  },
  onEnd(e) { this.setData({ endDate: e.detail.value }, () => this.sync()) },
  onEmoji(e) { this.setData({ emoji: e.currentTarget.dataset.em }) },
  onColor(e) { this.setData({ color: e.currentTarget.dataset.color }) },
  async submit() {
    if (this.data.submitting) return
    const title = (this.data.title || '').trim()
    if (!title) { wx.showToast({ title: '请填写旅程名称', icon: 'none' }); return }
    if (this.data.endDate < this.data.startDate) { wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' }); return }
    this.setData({ submitting: true })
    try {
      await store.createTrip({
        title,
        destination: (this.data.destination || '').trim(),
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        budget: parseFloat(this.data.budget) || 0,
        coverEmoji: this.data.emoji,
        coverColor: this.data.color
      })
      wx.showToast({ title: '创建成功，出发！', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 700)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '创建失败，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  }
})
