const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')

const DAY_COLORS = { 1: 'd1', 2: 'd2', 3: 'd3', 4: 'd4' }

function pad(n) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function hasCoord(s) { return s && s.lat != null && s.lng != null }

Page({
  data: {
    themeClass: '',
    loading: true,
    hasTrip: false,
    days: [],
    dayIdx: 0,
    dayStops: [],
    doneCount: 0,
    progress: 0,
    offToday: false, // 今天不在行程内提示
    hasSketch: false, // 当天站点含 mx/my 手绘图锚点时才显示底图块
    tripTitle: ''
  },
  onShow() {
    if (typeof this.getTabBar === 'function') this.getTabBar().setSelected(1)
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      let t = store.trip
      if (!t && store.trips.length) {
        // ready 的 bundle 预热在后台进行；此处 await 复用同一 in-flight（去重后零额外请求）
        const cur = store.trips.find(x => x.id === store.currentTripId()) || store.trips[0]
        await store.loadTrip(cur.id)
        t = store.trip
      }
      if (!t) {
        this.setData({ loading: false, hasTrip: false, days: [], dayStops: [] })
        return
      }
      const days = t.days || []
      // 「今天」匹配：store.trip.start 起算第 N 天；无今日则显示第 1 天并提示
      const today = todayStr()
      let dayIdx = 0
      let offToday = days.length > 0
      const hit = days.findIndex(d => d.rawDate === today)
      if (hit >= 0) {
        dayIdx = hit
        offToday = false
      }
      const keep = Math.min(this.data.dayIdx, Math.max(0, days.length - 1))
      // 非首次进入保留用户切到的天；首次按今天定位
      const finalIdx = this._visited ? keep : dayIdx
      this._visited = true
      this.setData({
        loading: false,
        hasTrip: true,
        days,
        dayIdx: finalIdx,
        offToday,
        tripTitle: t.title
      })
      this.refresh()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  doneKey() {
    // 勾选进度本地记忆，按行程 id 隔离
    const t = store.trip
    return 'trip-mode-done:' + (t ? t.id : 'default')
  },
  loadDone() {
    try { return wx.getStorageSync(this.doneKey()) || {} } catch (e) { return {} }
  },
  refresh() {
    if (!store.trip) { this.setData({ dayStops: [], doneCount: 0, progress: 0 }); return }
    const days = this.data.days
    if (!days.length) { this.setData({ dayStops: [], doneCount: 0, progress: 0 }); return }
    const done = this.loadDone()
    const day = days[this.data.dayIdx].d
    const list = store.stops.filter(s => s.day === day)
      .slice().sort((a, b) => (a.time < b.time ? -1 : 1))
    let nextMarked = false
    const enriched = list.map((s, i) => {
      const isDone = !!done[s.id]
      let next = false
      if (!isDone && !nextMarked) { next = true; nextMarked = true } // 按时间顺序第一个未完成 = 下一站
      let leg = ''
      if (i > 0 && hasCoord(list[i - 1]) && hasCoord(s)) {
        const est = engine.legEstimate(list[i - 1], s)
        leg = '距上站 ' + est.km + ' km · 约 ' + est.min + ' 分钟'
      }
      return { ...s, done: isDone, next, leg, dayColor: DAY_COLORS[s.day] || ('d' + (((s.day - 1) % 4) + 1)) }
    })
    const doneCount = enriched.filter(s => s.done).length
    this.setData({
      dayStops: enriched,
      doneCount,
      progress: enriched.length ? Math.round(doneCount / enriched.length * 100) : 0,
      hasSketch: enriched.some(s => s.mx != null && s.my != null)
    })
  },
  pickDay(e) { this.setData({ dayIdx: Number(e.currentTarget.dataset.i) }, () => this.refresh()) },
  toggleDone(e) {
    const id = e.currentTarget.dataset.id
    const done = this.loadDone()
    done[id] = !done[id]
    try { wx.setStorageSync(this.doneKey(), done) } catch (err) { /* 忽略 */ }
    this.refresh()
  },
  navHere(e) {
    const id = e.currentTarget.dataset.id
    const s = store.stops.find(x => x.id === id)
    if (!s || !hasCoord(s)) { wx.showToast({ title: '该站暂无坐标', icon: 'none' }); return }
    wx.openLocation({ latitude: Number(s.lat), longitude: Number(s.lng), name: s.name, address: s.place || '', scale: 14 })
  },
  copyRoute() {
    const days = this.data.days
    if (!days.length) return
    const lines = this.data.dayStops.map(s => s.time + ' ' + s.name + (s.cost > 0 ? '(¥' + s.cost + ')' : ''))
    const text = '【' + this.data.tripTitle + ' · D' + days[this.data.dayIdx].d + '】\n' + lines.join('\n→ ')
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '今日路线已复制', icon: 'success' }) })
  },
  amapRoute() {
    const days = this.data.days
    if (!days.length) return
    const day = days[this.data.dayIdx].d
    const list = store.stops
      .filter(s => s.day === day && hasCoord(s))
      .sort((a, b) => (a.time < b.time ? -1 : 1))
    if (list.length < 2) { wx.showToast({ title: '当天带坐标的站点不足', icon: 'none' }); return }
    const first = list[0], last = list[list.length - 1]
    const via = list.slice(1, -1).map(s => s.lng + ',' + s.lat).join('|')
    const url = 'https://uri.amap.com/navigation?from=' + first.lng + ',' + first.lat +
      '&to=' + last.lng + ',' + last.lat +
      (via ? '&via=' + via : '') + '&mode=car&policy=&src=gotrip&coordinate=gaode&callnative=0'
    wx.setClipboardData({
      data: url,
      success: () => wx.showModal({
        title: '高德全天路线链接已复制',
        content: '粘贴到浏览器或发给同车伙伴即可打开全程导航（多途经点）。',
        showCancel: false
      })
    })
  }
})
