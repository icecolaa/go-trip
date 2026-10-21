const api = require('../../utils/api')
const store = require('../../utils/store')
const theme = require('../../utils/theme')

/* 轮询节奏（2026-10-21 资源点优化）：飞猪 job 通常 20~60s 才出结果，
   前 15s 用快轮询给反馈，之后放慢一档——一次查询的轮询次数从 ~24 次降到 ~12 次，
   网关调用与容器算力同步减半。 */
const POLL_FAST_MS = 3000
const POLL_SLOW_MS = 6000
const POLL_FAST_UNTIL_MS = 15000
const POLL_MAX_MS = 120000 // 轮询上限

function isoDate(offsetDays) {
  const d = new Date(Date.now() + (offsetDays || 0) * 86400000)
  const p = (x) => String(x).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function shiftDays(iso, n) {
  const d = new Date((iso || isoDate(0)) + 'T00:00:00')
  if (isNaN(d.getTime())) return isoDate(3)
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

Page({
  data: {
    themeClass: '',
    from: '北京',
    to: '',
    trip: 'oneway', // 'round' | 'oneway'
    date: isoDate(4),
    backDate: isoDate(7),
    pax: 2,
    searching: false,
    searchSec: 0,
    result: null,
    combos: [],
    wx4: [],
    tips: [],
    engineTag: '实时数据',
    locating: false
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try { await store.ready() } catch (e) { /* 本页不依赖行程数据 */ }
  },
  onUnload() { this.clearTimer() },
  clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  },

  // ---------- 表单 ----------
  onFrom(e) { this.setData({ from: e.detail.value }) },
  onTo(e) { this.setData({ to: e.detail.value }) },
  swapCity() {
    const f = this.data.from
    const t = this.data.to
    if (!t.trim()) { wx.showToast({ title: '先填目的地再交换', icon: 'none' }); return }
    this.setData({ from: t, to: f })
  },
  onDate(e) {
    const date = e.detail.value
    const patch = { date }
    if (this.data.trip === 'round' && this.data.backDate <= date) patch.backDate = shiftDays(date, 3)
    this.setData(patch)
  },
  onBackDate(e) { this.setData({ backDate: e.detail.value }) },
  setTrip(e) {
    const v = e.currentTarget.dataset.v
    if (v === this.data.trip) return
    const patch = { trip: v }
    if (v === 'round' && this.data.backDate <= this.data.date) patch.backDate = shiftDays(this.data.date, 3)
    this.setData(patch)
  },
  incPax() { this.setData({ pax: Math.min(9, this.data.pax + 1) }) },
  decPax() { this.setData({ pax: Math.max(1, this.data.pax - 1) }) },

  // ---------- 定位识别出发地 ----------
  locate() {
    if (this.data.locating) return
    this.setData({ locating: true })
    wx.getLocation({
      type: 'gcj02',
      success: (pos) => {
        api.get('/api/poi/regeo?lat=' + pos.latitude + '&lng=' + pos.longitude)
          .then((r) => {
            const city = String((r && (r.city || r.province)) || '').replace(/市$/, '')
            if (!city) { wx.showToast({ title: '没识别出城市，手动填一下吧', icon: 'none' }); return }
            this.setData({ from: city })
            wx.showToast({ title: '已识别：' + city, icon: 'none' })
          })
          .catch(() => wx.showToast({ title: '位置解析失败，请手动填写', icon: 'none' }))
          .then(() => this.setData({ locating: false }))
      },
      fail: () => {
        this.setData({ locating: false })
        wx.showToast({ title: '未获得定位权限，请手动填写出发地', icon: 'none' })
      }
    })
  },

  // ---------- 搜索：异步 job + 轮询 ----------
  search() {
    if (this.data.searching) return
    const from = (this.data.from || '').trim()
    if (!from) { wx.showToast({ title: '填一下出发城市', icon: 'none' }); return }
    this.clearTimer()
    this.setData({ searching: true, searchSec: 0, result: null, combos: [], wx4: [], tips: [] })
    api.post('/api/flywhere/search', {
      origin: from,
      destination: (this.data.to || '').trim(),
      trip: this.data.trip,
      depDate: this.data.date,
      backDate: this.data.trip === 'round' ? this.data.backDate : '',
      passengers: this.data.pax
    })
      .then((r) => {
        if (!r || !r.jobId) throw new Error('服务未返回任务，请稍后再试')
        this._start = Date.now()
        this.poll(r.jobId)
      })
      .catch((e) => {
        this.setData({ searching: false })
        wx.showToast({ title: (e && e.message) || '搜索失败，请稍后再试', icon: 'none' })
      })
  },
  poll(jobId) {
    this.clearTimer()
    // 已等待时长决定下一次间隔：前期快、后期慢（退避）
    const gap = (Date.now() - this._start) >= POLL_FAST_UNTIL_MS ? POLL_SLOW_MS : POLL_FAST_MS
    this._timer = setTimeout(() => {
      const waited = Math.round((Date.now() - this._start) / 1000)
      if (Date.now() - this._start >= POLL_MAX_MS) {
        this.setData({ searching: false, searchSec: waited })
        wx.showToast({ title: '查询超时了，请稍后再试', icon: 'none' })
        return
      }
      api.get('/api/flywhere/search?jobId=' + encodeURIComponent(jobId))
        .then((st) => {
          if (st && st.status === 'done') { this.render(st); return }
          if (st && st.status === 'error') throw new Error((st && st.error) || '查询失败，请重试')
          this.setData({ searchSec: waited })
          this.poll(jobId)
        })
        .catch((e) => {
          this.setData({ searching: false })
          wx.showToast({ title: (e && e.message) || '查询失败，请重试', icon: 'none' })
        })
    }, gap)
  },

  // ---------- 结果映射到页面字段 ----------
  render(st) {
    const results = (st && st.results) || []
    if (!results.length) {
      this.setData({ searching: false })
      wx.showToast({ title: '没找到合适的航班，换个日期试试', icon: 'none' })
      return
    }
    const pax = this.data.pax
    const combos = results.slice(0, 6).map((r, i) => ({
      id: r.id || 'c' + i,
      type: r.city || (this.data.to || '').trim() || '低价组合',
      note: [r.airline || '', r.direct ? '直飞' : '中转', r.duration ? r.duration + 'h' : '']
        .filter(Boolean).join(' · '),
      depart: r.out || '--:--',
      arrive: r.outArr || '--:--',
      back: (r.back && r.back !== '—') ? r.back : '',
      backArr: (r.backArr && r.backArr !== '—') ? r.backArr : '',
      pricePax: r.perPerson != null ? r.perPerson : (r.totalPrice || 0),
      total: r.totalPrice != null ? r.totalPrice : (r.perPerson || 0) * pax,
      jumpUrl: r.jumpUrl || ''
    }))
    const wx4 = (((results[0] && results[0].weather) || [])).slice(0, 4).map((w) => ({
      date: String(w.date || '').slice(5).replace('-', '.'),
      icon: w.icon || '🌡️',
      lo: w.tempMin == null ? '--' : w.tempMin,
      hi: w.tempMax == null ? '--' : w.tempMax
    }))
    this.setData({
      searching: false,
      result: { count: (st && st.count) || combos.length },
      combos,
      wx4,
      tips: this.makeTips(wx4)
    })
  },
  makeTips(wx4) {
    const tips = []
    if (!wx4.length) { tips.push('目的地天气暂未取到，出发前再看看预报'); return tips }
    const rain = wx4.filter((d) => /雨|雪/.test(d.icon)).length
    tips.push(rain ? '有 ' + rain + ' 天降水概率，雨具备好' : '整体天气稳定，适合出行')
    const his = wx4.map((d) => Number(d.hi)).filter((n) => !isNaN(n))
    const los = wx4.map((d) => Number(d.lo)).filter((n) => !isNaN(n))
    if (his.length && los.length) {
      const span = Math.max.apply(null, his) - Math.min.apply(null, los)
      if (span >= 10) tips.push('昼夜温差约 ' + span + '°C，记得分层穿搭')
    }
    tips.push('票价实时波动，趁低价尽早下手')
    return tips
  },

  // ---------- 复制购票链接 ----------
  copyFlight(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const c = this.data.combos[idx]
    if (!c) return
    const url = c.jumpUrl || ('https://h5.m.taobao.com/trip/flight/search?depCity=' +
      encodeURIComponent(this.data.from) + '&arrCity=' + encodeURIComponent(c.type) +
      '&date=' + this.data.date + '&pax=' + this.data.pax)
    wx.setClipboardData({
      data: url,
      success: () => wx.showModal({
        title: c.type + ' · 搜索链接已复制',
        content: '粘贴到浏览器或购票 App 完成查询与下单。',
        showCancel: false
      })
    })
  }
})
