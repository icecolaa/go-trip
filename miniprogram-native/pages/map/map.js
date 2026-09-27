const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')
const entities = require('../../utils/rdb/entities')
const api = require('../../utils/api')

// 按天分色（callout 背景），超过 4 天循环取色
const DAY_BG = { 1: '#2BB8A8', 2: '#2E92ED', 3: '#FF8A5C', 4: '#7B8CFF' }
const MARKER_ICON = '/assets/logo.png'

function dayBg(d) { return DAY_BG[d] || DAY_BG[(((d - 1) % 4) + 4) % 4 + 1] || '#51637A' }
function hasCoord(s) { return s && s.lat != null && s.lng != null }

Page({
  data: {
    themeClass: '',
    loading: true,
    hasTrip: false,
    days: [],
    layer: 'std',        // std 标准图 | sat 卫星图（map type 属性）
    filter: 0,           // 0=全部，>0=按天（dayNumber）
    filterTitle: '',
    dateLabel: '',
    markers: [],
    shownStops: [],
    center: { latitude: 39.908, longitude: 116.397 },
    includePoints: [],
    hasCoords: false,
    totalKm: 0, totalMin: 0, totalCost: 0,
    attrBottom: 250
  },
  onReady() {
    // SelectorQuery 实测面板高度定位角标（onReady 查、判空、exec 收尾）
    wx.createSelectorQuery()
      .select('.map-sheet')
      .boundingClientRect(rect => {
        if (rect && rect.height) this.setData({ attrBottom: Math.ceil(rect.height + 8) })
      })
      .exec()
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  /** 无坐标时批量地理编码一次（容器高德 POI，限流内）：成功即落库并刷新 */
  async autoGeocodeOnce() {
    try {
      const pending = store.stops.filter(s2 => (s2.lat == null || s2.lng == null) && (s2.name || s2.place))
      if (!pending.length || this.data.hasCoords) return
      wx.showLoading({ title: '坐标解析中…' })
      const items = pending.slice(0, 20).map(s2 => ({
        id: s2.id,
        query: (s2.place || s2.name || '').replace(/^(穿越|游览|前往|到达|入住|返回|集合)/, '').slice(0, 30),
        alt: s2.name || '',
        city: store.trip.city || '',
      }))
      const geo = await api.post('/api/poi/geocode', { items })
      const coords = geo.coords || {}
      let hit = 0
      for (const [id, c] of Object.entries(coords)) {
        const row = store.stops.find(x => x.id === id)
        if (row) { hit++; await entities.updateRow('gt_activities', id, { lat: c.lat, lng: c.lng }) }
      }
      wx.hideLoading()
      if (hit > 0) { wx.showToast({ title: '已定位 ' + hit + ' 个地点', icon: 'none' }); await store.reload(); this.boot() }
    } catch (e) {
      try { wx.hideLoading() } catch (e2) { /* ignore */ }
    }
  },

  async boot() {
    try {
      await store.ready()
      const t = store.trip
      if (!t) {
        this.setData({ loading: false, hasTrip: false, markers: [], shownStops: [] })
        return
      }
      const days = t.days || []
      const dateLabel = days.length ? days[0].date + ' – ' + days[days.length - 1].date : ''
      this.setData({
        loading: false,
        hasTrip: true,
        days,
        filterTitle: t.title,
        dateLabel
      })
      this.applyFilter()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  applyFilter() {
    if (!store.trip) return
    const t = store.trip
    const days = this.data.days
    const f = this.data.filter
    const all = store.stops.slice().sort((a, b) => (a.day - b.day) || (a.time < b.time ? -1 : 1))
    const list = all.filter(s => f === 0 || s.day === f)

    // 序号（按天内时间序）+ 地图 markers（仅有坐标的站；callout 按天分色，显示名称+费用）
    const coordStops = list.filter(hasCoord)
    const markers = coordStops.map((s, i) => {
      return {
        id: i,
        latitude: Number(s.lat),
        longitude: Number(s.lng),
        iconPath: MARKER_ICON,
        width: 26,
        height: 26,
        callout: {
          content: s.name + (s.cost > 0 ? ' ¥' + s.cost : ''),
          color: '#FFFFFF',
          bgColor: dayBg(s.day),
          padding: 6,
          borderRadius: 8,
          fontSize: 11,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      }
    })
    // marker 数字 id → 站点映射
    this._markerStops = coordStops

    // 里程/车程（引擎估算，仅相邻两站都有坐标时累计）
    let km = 0, min = 0
    const dayNums = f === 0 ? days.map(d => d.d) : [f]
    dayNums.forEach(d => {
      const dayList = all.filter(s => s.day === d).sort((a, b) => (a.time < b.time ? -1 : 1))
      for (let i = 1; i < dayList.length; i++) {
        if (!hasCoord(dayList[i - 1]) || !hasCoord(dayList[i])) continue
        const est = engine.legEstimate(dayList[i - 1], dayList[i])
        km += est.km; min += est.min
      }
    })

    // 视野：包含全部标记点
    let includePoints = [], center = this.data.center, hasCoords = markers.length > 0
    if (hasCoords) {
      includePoints = markers.map(m => ({ latitude: m.latitude, longitude: m.longitude }))
      const lat = includePoints.reduce((s, p) => s + p.latitude, 0) / includePoints.length
      const lng = includePoints.reduce((s, p) => s + p.longitude, 0) / includePoints.length
      center = { latitude: lat, longitude: lng }
    }

    // 筛选标题 / 日期
    const dayObj = days.find(d => d.d === f)
    const filterTitle = f === 0 ? t.title : ('D' + f + (dayObj && dayObj.title ? ' · ' + dayObj.title : ''))
    const dateLabel2 = f === 0
      ? (days.length ? days[0].date + ' – ' + days[days.length - 1].date : '')
      : (dayObj ? dayObj.date + ' ' + dayObj.week : '')

    // 站点列表序号（按天内时间序，全部站点计数）
    const seqPerDay = {}
    this.setData({
      markers,
      includePoints,
      center,
      hasCoords,
      shownStops: list.map(s => {
        seqPerDay[s.day] = (seqPerDay[s.day] || 0) + 1
        return { ...s, seq: seqPerDay[s.day], costTxt: s.cost > 0 ? '¥' + s.cost : '免费' }
      }),
      totalKm: Math.round(km * 1.25),
      totalMin: Math.round(min * 1.25 / 5) * 5,
      totalCost: list.reduce((s, x) => s + (x.cost || 0), 0),
      filterTitle,
      dateLabel: dateLabel2
    })
  },
  setFilter(e) { this.setData({ filter: Number(e.currentTarget.dataset.d) || 0 }, () => this.applyFilter()) },
  toggleLayer() {
    this.setData({ layer: this.data.layer === 'std' ? 'sat' : 'std' })
  },
  onMarkerTap(e) {
    const idx = e.detail && e.detail.markerId
    const s = (this._markerStops || [])[idx]
    if (s) this.openLoc(s)
  },
  openLoc(s) {
    if (!hasCoord(s)) { wx.showToast({ title: '该站暂无坐标', icon: 'none' }); return }
    wx.openLocation({
      latitude: Number(s.lat),
      longitude: Number(s.lng),
      name: s.name,
      address: s.place || '',
      scale: 14
    })
  },
  rowTap(e) {
    const id = e.currentTarget.dataset.id
    const s = store.stops.find(x => x.id === id)
    if (s) this.openLoc(s)
  },
  searchPlaces() { wx.navigateTo({ url: '/pages/places/places' }) },
  xhsSearch(e) {
    const name = e.currentTarget.dataset.name
    const url = 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(name + ' 攻略')
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '小红书搜索链接已复制', icon: 'none' })
    })
  },
  locate() {
    // 回到当前筛选范围首个带坐标的站点（不依赖定位授权）
    if (!this.data.markers.length) { wx.showToast({ title: '暂无坐标可定位', icon: 'none' }); return }
    const m = this.data.markers[0]
    this.setData({ center: { latitude: m.latitude, longitude: m.longitude } })
  },
  navAll() {
    // 与出发模式一致的全天多途经点方案
    const f = this.data.filter === 0 ? (this.data.days[0] ? this.data.days[0].d : 0) : this.data.filter
    if (!f) { wx.showToast({ title: '暂无行程日', icon: 'none' }); return }
    const list = store.stops
      .filter(s => s.day === f && hasCoord(s))
      .sort((a, b) => (a.time < b.time ? -1 : 1))
    if (list.length < 2) { wx.showToast({ title: '当天带坐标的站点不足', icon: 'none' }); return }
    const first = list[0], last = list[list.length - 1]
    const via = list.slice(1, -1).map(s => s.lng + ',' + s.lat).join('|')
    const url = 'https://uri.amap.com/navigation?from=' + first.lng + ',' + first.lat +
      '&to=' + last.lng + ',' + last.lat + (via ? '&via=' + via : '') +
      '&mode=car&policy=&src=gotrip&coordinate=gaode&callnative=0'
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '全天路线链接已复制', icon: 'none' }) })
  }
})
