const theme = require('../../utils/theme')
const engine = require('../../utils/engine')
const store = require('../../utils/store')

function pad(n) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
}
function money(n) { return '¥' + Number(n || 0).toLocaleString() }

Page({
  data: {
    themeClass: '',
    loading: true,
    hasTrip: false,
    dbg: '',
    // 头图与标题区
    coverSrc: '/assets/yichun-lake.jpg',
    liveTxt: '',
    tripTitle: '',
    dateLabel: '',
    stopsCount: 0,
    // 成员条
    members: [],
    ownerName: '',
    // 天气
    city: '',
    weather: [],
    // 小助手建议（数据推导，非固定文案）
    assistantTip: '',
    // 进度与账目摘要
    progress: 0,
    billCount: 0,
    totalSpentTxt: '¥0',
    budgetTxt: '',
    perHeadTxt: '',
    packingTag: '',
    // 每日安排
    dayList: []
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      const t = store.trip
      // TEMP-DEBUG
      try {
        const w = wx
        const cur = w.getStorageSync('gotrip:current-trip') || '(none)'
        this.setData({ dbg: 'cur=' + cur + ' trips=' + (store.trips || []).length + ' tripNull=' + (t == null) + ' readyFlag=' + store.ready })
      } catch (e) { this.setData({ dbg: 'dbg-err ' + e.message }) }
      if (!t) {
        this.setData({ loading: false, hasTrip: false, weather: [] })
        return
      }
      const days = t.days || []
      const today = todayStr()
      const stops = store.stops || []
      const bills = store.bills || []

      // 头图：有封面图用封面，否则静态装饰图
      const coverSrc = t.coverImage || '/assets/yichun-lake.jpg'

      // 状态 chip：未开始 / 进行中第 N 天 / 已结束
      let liveTxt = '行程待安排'
      if (days.length) {
        const first = days[0].rawDate, last = days[days.length - 1].rawDate
        if (today < first) {
          const gap = Math.max(1, daysBetween(today, first))
          liveTxt = '未开始 · 还有 ' + gap + ' 天'
        } else if (today > last) {
          liveTxt = '行程已结束'
        } else {
          const hit = days.findIndex(d => d.rawDate === today)
          liveTxt = hit >= 0 ? '进行中 · 第 ' + (hit + 1) + ' 天' : '进行中'
        }
      }

      // 日期条：10月2日 – 10月5日 · 4天3晚
      let dateLabel = ''
      if (days.length) {
        dateLabel = days[0].date + ' – ' + days[days.length - 1].date + ' · ' +
          days.length + '天' + Math.max(0, days.length - 1) + '晚'
      }

      // 成员
      const members = t.members || []
      const owner = members.find(m => m.role === 'owner') || members[0] || null

      // 行程进度（按起止日期）
      let progress = 0
      if (days.length) {
        const first = days[0].rawDate, last = days[days.length - 1].rawDate
        if (today >= last) progress = 100
        else if (today > first) {
          const total = Math.max(1, daysBetween(first, last))
          progress = Math.min(99, Math.max(1, Math.round(daysBetween(first, today) / total * 100)))
        }
      }

      // 账目摘要
      const totalSpent = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0)
      const head = members.length || 1
      const budget = Number(t.budgetTotal) || 0

      // 小助手建议：找安排最少的一天（数据推导）
      let assistantTip = '暂无安排，先去日程补第一站吧'
      if (stops.length && days.length) {
        let minDay = days[0], minCount = Infinity
        days.forEach(d => {
          const c = stops.filter(s => s.day === d.d).length
          if (c < minCount) { minCount = c; minDay = d }
        })
        if (minCount === 0) assistantTip = '小助手：D' + minDay.d + ' 还没有安排，去日程或候选地点里补一站吧'
        else assistantTip = '小助手：D' + minDay.d + ' 只有 ' + minCount + ' 个安排，时间最宽松，可再补充一处'
      } else if (stops.length) {
        assistantTip = '小助手：已有 ' + stops.length + ' 个安排，去日程查看详情吧'
      }

      // 每日安排卡
      const dayList = days.map(d => {
        const count = stops.filter(s => s.day === d.d).length
        const state = d.rawDate < today ? 'done' : (d.rawDate === today ? 'today' : '')
        return {
          d: d.d, date: d.date, week: d.week, title: d.title || ('第 ' + d.d + ' 天'),
          count, state, isToday: state === 'today'
        }
      })

      // 行李清单摘要
      const pk = store.packing || []
      const packingDone = pk.filter(x => x.done).length
      const packingTag = pk.length ? '行李清单 ' + packingDone + '/' + pk.length : ''

      this.setData({
        loading: false,
        hasTrip: true,
        coverSrc,
        liveTxt,
        tripTitle: t.title,
        dateLabel,
        stopsCount: stops.length,
        members,
        ownerName: owner ? owner.name : '',
        city: t.city || t.destination || '',
        weather: engine.weather(t.city || t.destination, t.start || todayStr(), 4),
        assistantTip,
        progress,
        billCount: bills.length,
        totalSpentTxt: money(totalSpent),
        budgetTxt: budget > 0 ? '预算 ' + money(budget) : '',
        perHeadTxt: totalSpent > 0 ? '人均 ' + money(Math.round(totalSpent / head)) : '',
        packingTag,
        dayList
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  go(e) {
    const url = e.currentTarget.dataset.url
    if (url.indexOf('/pages/trip-mode/') === 0) wx.switchTab({ url })
    else wx.navigateTo({ url })
  },
  invite() { wx.navigateTo({ url: '/pages/invite/invite' }) },
  onShareAppMessage() {
    const t = store.trip
    return {
      title: (t ? t.title : '一起去旅行') + ' · 行程只读分享',
      path: '/pages/overview/overview?ro=1',
      imageUrl: '/assets/yichun-road.jpg'
    }
  }
})
