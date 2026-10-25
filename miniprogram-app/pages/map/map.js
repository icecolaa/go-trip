const store = require('../../utils/store')
const engine = require('../../utils/engine')
const theme = require('../../utils/theme')
const entities = require('../../utils/rdb/entities')
const api = require('../../utils/api')

// 按天分色（callout 背景），超过 4 天循环取色
const DAY_BG = { 1: '#2BB8A8', 2: '#2E92ED', 3: '#FF8A5C', 4: '#7B8CFF' }
// 圆头针图标按天取色：assets/markers/pin-d1~d4.png（@2x 64×80 源图，显示 32×40，
// 针尖=底边中点=marker 默认锚点 {x:.5,y:1}）；由 work/gen-map-markers.mjs 生成，改色/改形重跑该脚本
function pinIcon(d) { return '/assets/markers/pin-d' + ((((d - 1) % 4) + 4) % 4 + 1) + '.png' }

/* 已编码过的站点（2026-10-21 资源点优化，同日修复；10-22 补 city/tripId）：
   键=行程id+城市+站点id+查询词+名称——**所有影响编码结果的参数都必须进键**（CLAUDE 红线 2）：
   city 会随行程目的地变化直接影响高德 POI 结果，若只按 id/名称缓存，改了城市仍被旧负缓存屏蔽。
   同内容站点最多尝试 GEO_MAX_TRIES 次（负缓存有界，服务端偶发漏报下次进页还能自愈），
   改过名称/地点/城市后键变化即视为新键；请求级失败直接删键，不把站点永久挡在编码门外。
   调用方必须传入**本次请求捕获的** tripId/city，不得在键计算里再读可变的 store.trip。 */
const geoAttempted = new Map() // key -> 已尝试次数
const GEO_MAX_TRIES = 2
function geoQuery(s) {
  return (s.place || s.name || '').replace(/^(穿越|游览|前往|到达|入住|返回|集合)/, '').slice(0, 30)
}
function geoKey(s, tripId, city) {
  return [tripId || '', city || '', s.id, geoQuery(s), s.name || ''].join('|')
}

function dayBg(d) { return DAY_BG[d] || DAY_BG[(((d - 1) % 4) + 4) % 4 + 1] || '#51637A' }
/* 地图组件颜色须 6/8 位十六进制，8 位末两位为 alpha——半透明天色（连线）用它拼 */
function hexAlpha(hex, a) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).toUpperCase().padStart(2, '0')
  return hex + v
}
function hasCoord(s) { return s && s.lat != null && s.lng != null }
/* callout 显示名截断：超长名称气泡横穿屏幕且相邻遮挡（显示层截断，不碰数据） */
function cutName(name) {
  const t = (name || '').trim()
  return t.length > 12 ? t.slice(0, 12) + '…' : t
}

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
    polylines: [],
    selStopId: '',      // 当前选中（放大+气泡常显）的站点 id
    sheetInto: '',      // 底部卡片 scroll-into-view 锚点
    showLoc: false,     // show-location：定位按钮开启后显示我的位置
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
  onUnload() { this._unloaded = true },
  /** 无坐标时批量地理编码一次（容器高德 POI，限流内）：成功即落库并刷新 */
  async autoGeocodeOnce() {
    if (this._geocoding) return
    this._geocoding = true
    const tripId = (store.trip && store.trip.id) || ''
    // 与本次请求同源捕获城市：键必须与请求参数一致，之后不再读可变的 store.trip
    const city = (store.trip && store.trip.city) || ''
    const marked = [] // 本批已标记的键：请求级失败回滚，避免站点被永久跳过
    try {
      let pending = store.stops.filter(s2 => (s2.lat == null || s2.lng == null) && (s2.name || s2.place))
      // 同内容站点已尝试满上限的跳过（含上次未命中的）；新增/内容/城市有变的仍会编码
      pending = pending.filter(s2 => (geoAttempted.get(geoKey(s2, tripId, city)) || 0) < GEO_MAX_TRIES)
      // 只按「待编码站点」判空：原实现 `|| this.data.hasCoords` 会在已有任一坐标时
      // 直接跳过——新增/未命中站点从此再也不编码（2026-10-21 复现：A 站命中后 B 站永不重试）
      if (!pending.length) return
      wx.showLoading({ title: '坐标解析中…' })
      const batch = pending.slice(0, 20)
      batch.forEach(s2 => { const k = geoKey(s2, tripId, city); geoAttempted.set(k, (geoAttempted.get(k) || 0) + 1); marked.push(k) })
      const items = batch.map(s2 => ({
        id: s2.id,
        query: geoQuery(s2),
        alt: s2.name || '',
        city, // 用捕获值：与负缓存键同源，避免键与请求参数漂移
      }))
      const geo = await api.post('/api/poi/geocode', { items })
      const coords = geo.coords || {}
      let hit = 0
      for (const [id, c] of Object.entries(coords)) {
        // 按活动 id 直写云端：即使响应期间已切到别的行程也写对行，不丢返回的坐标
        hit++
        await entities.updateRow('gt_activities', id, { lat: c.lat, lng: c.lng })
      }
      wx.hideLoading()
      // 响应期间切走行程或页面已销毁：数据已落库，toast/刷新只属原行程，不再打扰新上下文
      if (this._unloaded || !store.trip || store.trip.id !== tripId) return
      if (hit > 0) {
        wx.showToast({ title: '已定位 ' + hit + ' 个地点', icon: 'none' })
        await store.reload()
        this.applyFilter() // 只刷视图：不再走 boot()，避免同一轮里对未命中站点立刻二次编码
      } else { wx.showToast({ title: '没定位到，去日程删除重加该地点再试', icon: 'none' }) }
    } catch (e) {
      marked.forEach(k => geoAttempted.delete(k))
      try { wx.hideLoading() } catch (e2) { /* ignore */ }
    } finally {
      this._geocoding = false
    }
  },
  goSchedule() { wx.navigateTo({ url: '/pages/schedule/schedule' }) },

  async boot() {
    try {
      await store.ready()
      const t = store.trip
      if (!t) {
        this.setData({ loading: false, hasTrip: false, hasCoords: false, markers: [], polylines: [], shownStops: [] })
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
      // 站点缺坐标时自动批量编码一次（容器高德 POI）；成功会落库并刷新。
      // 不按 hasCoords 提前拦截：只要有站点缺坐标就要编码，否则新增站点在有坐标的行程里永远不定位。
      this.autoGeocodeOnce()
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

    // 天内序号：对全部站点计数（与底部卡片序号一致），地图只显示其中有坐标的
    const seqPerDay = {}
    const seqOf = {}
    list.forEach(s => {
      seqPerDay[s.day] = (seqPerDay[s.day] || 0) + 1
      seqOf[s.id] = seqPerDay[s.day]
    })

    // 地图 markers：按天分色圆头针 + 序号叠针头 + callout 按天分色（名称+费用）
    const coordStops = list.filter(hasCoord)
    const selStopId = this.data.selStopId
    const markers = coordStops.map((s, i) => {
      const sel = selStopId === s.id
      const seqStr = String(seqOf[s.id] || '')
      return {
        id: i,
        latitude: Number(s.lat),
        longitude: Number(s.lng),
        iconPath: pinIcon(s.day),
        width: sel ? 38 : 32,
        height: sel ? 48 : 40,
        label: {
          content: seqStr,
          color: '#FFFFFF',
          fontSize: 12,
          textAlign: 'center',
          bgColor: '#00000000', // 8 位 hex 全透明：序号直接叠在针头上
          /* 原点=锚点（针尖）：偏移把序号推到针头圆心（显示高 40px，圆心距针尖约 27px），
             anchorX 按位数左移半宽。偏移量以开发工具截图校准；
             真机若 label 透明底/定位渲染异常，整段删掉 label 即回退为无序号纯针 */
          anchorX: -(seqStr.length * 12 * 0.55) / 2,
          anchorY: -34
        },
        callout: {
          /* 名称截 12 字：超长 callout 横穿屏幕且与相邻 marker 重叠（1.5.23 用户反馈） */
          content: cutName(s.name) + (s.cost > 0 ? ' ¥' + s.cost : ''),
          color: '#FFFFFF',
          bgColor: dayBg(s.day),
          padding: 8,
          borderRadius: 9,
          fontSize: 11,
          /* 按天筛选=单天站点少默认全显气泡；全部=30+ 挤成一团改点击显示（1.5.24 用户反馈）；选中态常显 */
          display: (sel || this.data.filter !== 0) ? 'ALWAYS' : 'BYCLICK',
          textAlign: 'center'
        }
      }
    })
    // marker 数字 id → 站点映射
    this._markerStops = coordStops

    // 里程/车程（引擎估算，仅相邻两站都有坐标时累计）+ 按天连线
    let km = 0, min = 0
    const polylines = []
    const dayNums = f === 0 ? days.map(d => d.d) : [f]
    dayNums.forEach(d => {
      const dayList = all.filter(s => s.day === d).sort((a, b) => (a.time < b.time ? -1 : 1))
      for (let i = 1; i < dayList.length; i++) {
        if (!hasCoord(dayList[i - 1]) || !hasCoord(dayList[i])) continue
        const est = engine.legEstimate(dayList[i - 1], dayList[i])
        km += est.km; min += est.min
      }
      // 按天连线：该天带坐标站点按时间序直线相连（示意动线非真实路径），天色 70% + 白描边
      const pts = dayList.filter(hasCoord).map(s => ({ latitude: Number(s.lat), longitude: Number(s.lng) }))
      if (pts.length >= 2) {
        polylines.push({
          points: pts,
          color: hexAlpha(dayBg(d), 0.7),
          width: 4,
          borderColor: '#FFFFFF',
          borderWidth: 1,
          dottedLine: false
        })
      }
    })

    // 视野：包含全部标记点，四周外扩 8% 防边缘图钉贴边/被面板遮挡
    let includePoints = [], center = this.data.center, hasCoords = markers.length > 0
    if (hasCoords) {
      const lats = markers.map(m => m.latitude)
      const lngs = markers.map(m => m.longitude)
      const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats)
      const minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs)
      const padLat = (maxLat - minLat) * 0.08 || 0.008
      const padLng = (maxLng - minLng) * 0.08 || 0.008
      includePoints = [
        { latitude: minLat - padLat, longitude: minLng - padLng },
        { latitude: maxLat + padLat, longitude: maxLng + padLng }
      ]
      center = { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 }
    }

    // 筛选标题 / 日期
    const dayObj = days.find(d => d.d === f)
    const filterTitle = f === 0 ? t.title : ('D' + f + (dayObj && dayObj.title ? ' · ' + dayObj.title : ''))
    const dateLabel2 = f === 0
      ? (days.length ? days[0].date + ' – ' + days[days.length - 1].date : '')
      : (dayObj ? dayObj.date + ' ' + dayObj.week : '')

    // 站点列表（序号复用 seqOf，与地图 label 同源）
    this.setData({
      markers,
      polylines,
      includePoints,
      center,
      hasCoords,
      shownStops: list.map(s => {
        return { ...s, seq: seqOf[s.id], costTxt: s.cost > 0 ? '¥' + s.cost : '免费', on: s.id === selStopId }
      }),
      totalKm: Math.round(km * 1.25),
      totalMin: Math.round(min * 1.25 / 5) * 5,
      totalCost: list.reduce((s, x) => s + (x.cost || 0), 0),
      filterTitle,
      dateLabel: dateLabel2
    })
  },
  setFilter(e) {
    this.setData({ filter: Number(e.currentTarget.dataset.d) || 0, selStopId: '', sheetInto: '' }, () => this.applyFilter())
  },
  toggleLayer() {
    this.setData({ layer: this.data.layer === 'std' ? 'sat' : 'std' })
  },
  /* 二段式选中：首点=选中（针放大+气泡常显+底部卡片定位高亮），再点同一针=跳导航 */
  onMarkerTap(e) {
    const idx = e.detail && e.detail.markerId
    const s = (this._markerStops || [])[idx]
    if (!s) return
    if (this.data.selStopId === s.id) { this.openLoc(s); return }
    this.setData({ selStopId: s.id, sheetInto: 'stop-' + s.id }, () => this.applyFilter())
  },
  onCalloutTap(e) {
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
    /* 定位按钮：开=显示我的位置（用户点击才触发授权弹窗）并移到当前位置；关=回到行程视野 */
    if (this.data.showLoc) {
      // include-points 内容变化才会触发重新适配视野：补一个重复点强制 refit
      const ip = this.data.includePoints.slice()
      if (ip.length) ip.push(ip[0])
      this.setData({ showLoc: false, includePoints: ip })
      return
    }
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({ showLoc: true, center: { latitude: res.latitude, longitude: res.longitude } })
        wx.showToast({ title: '已显示我的位置', icon: 'none' })
      },
      fail: () => wx.showToast({ title: '未授权定位，可在设置中开启', icon: 'none' })
    })
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
