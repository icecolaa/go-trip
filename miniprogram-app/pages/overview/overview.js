const theme = require('../../utils/theme')
const store = require('../../utils/store')
const storage = require('../../utils/rdb/storage')
const api = require('../../utils/api')

function pad(n) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
}
function money(n) { return '¥' + Number(n || 0).toLocaleString() }
function md(isoStr) {
  const p = (isoStr || '').split('-')
  if (p.length < 3) return '—'
  return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日'
}
function rangeTxt(s, e) {
  const n = daysBetween(s, e)
  if (isNaN(n) || n < 0) return '请选择日期'
  return n === 0 ? '当天往返' : '共 ' + (n + 1) + ' 天 ' + n + ' 晚'
}

// 天气速览：boot 渲染诚实 pending 槽位，loadWeather 拉容器真数据按 date 覆盖——任何情况不回落假数据
const WX_DAYS = 16 // Open-Meteo 主源 16 天窗口（1.5.31，容器 /api/weather 全窗口返回）
const WX_TTL = 3 * 60 * 60 * 1000
const weatherCache = {} // '城市|日期串' -> { at, rows }（只存真实行）

function isoAdd(baseISO, n) {
  const d = new Date(baseISO + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function wxTip(label, hi, lo) {
  if (label && label.indexOf('Ø') >= 0) return '历史气候参考' // Ø=去年同期估算，非实时预报（1.5.31）
  if (label && (label.indexOf('雨') >= 0 || label.indexOf('雪') >= 0)) return '带雨具'
  if (hi != null && lo != null && hi - lo > 9) return '早晚温差大'
  return '适宜出行'
}
// 初始槽位：未来行程给「预报未出」占位；行程已结束返回空（整卡隐藏）
function buildWxSlots(days, today) {
  if (!days.length || today > days[days.length - 1].rawDate) return []
  return days.slice(0, WX_DAYS).map((d, i) => ({
    date: String(d.rawDate || '').slice(5).replace('-', '.'),
    icon: i === 0 ? '⏳' : '·', pending: true, tip: i === 0 ? '出行前再查' : '暂无预报'
  }))
}

Page({
  data: {
    themeClass: '',
    loading: true,
    hasTrip: false,
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
    dayList: [],
    // 修改行程弹层（目的地/日期/预算）
    editShow: false,
    editBusy: false,
    editDestination: '',
    editStart: '',
    editEnd: '',
    editStartCn: '',
    editEndCn: '',
    editBudget: '',
    editRangeTxt: ''
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      const t = store.trip
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
        weather: buildWxSlots(days, today),
        assistantTip,
        progress,
        billCount: bills.length,
        totalSpentTxt: money(totalSpent),
        budgetTxt: budget > 0 ? '预算 ' + money(budget) : '',
        perHeadTxt: totalSpent > 0 ? '人均 ' + money(Math.round(totalSpent / head)) : '',
        packingTag,
        dayList
      })
      // 真天气异步覆盖；失败或窗口外无数据时保留上方占位渲染
      this.loadWeather(t)
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  async loadWeather(t) {
    const city = t.city || t.destination || ''
    if (!city) return
    const dates = []
    const span = Math.max(1, Math.min(16, WX_DAYS))
    const endCap = t.end && t.end > t.start ? t.end : ''
    const nDays = endCap ? Math.min(16, Math.round((new Date(endCap + 'T00:00:00') - new Date((t.start || todayStr()) + 'T00:00:00')) / 86400000) + 1) : Math.min(span, 7)
    for (let i = 0; i < nDays; i++) dates.push(isoAdd(t.start || todayStr(), i))
    if (todayStr() > dates[dates.length - 1]) return // 行程已结束：卡已隐藏，预报无意义
    const key = city + '|' + dates.join(',')
    let rows = null
    const hit = weatherCache[key]
    if (hit && Date.now() - hit.at < WX_TTL) {
      rows = hit.rows
    } else {
      try {
        const list = await api.get('/api/weather?place=' + encodeURIComponent(city) + '&dates=' + dates.join(','))
        // 无温度的行是预报窗口外占位（weatherCode=-1），丢弃后保留 pending 槽位
        rows = (Array.isArray(list) ? list : [])
          .filter(d => d && d.tempMax != null && d.tempMin != null)
          .map(d => {
            const est = (d.label || '').indexOf('Ø') >= 0
            const label = (d.label || '').replace('Ø ', '')
            return {
              date: String(d.date || '').slice(5).replace('-', '.'),
              icon: (d.icon || '—') + ' ' + label,
              est,
              hi: d.tempMax,
              lo: d.tempMin,
              tip: wxTip(d.label, d.tempMax, d.tempMin)
            }
          })
        weatherCache[key] = { at: Date.now(), rows }
      } catch (e) { /* 容器不可达，保留 pending 槽位 */ }
    }
    if (!rows) return
    // 真实行按 date 覆盖 pending 槽位；槽位外日期（无天数据场景）追加
    const merged = (this.data.weather || []).slice()
    rows.forEach(r => {
      const i = merged.findIndex(m => m.date === r.date)
      if (i >= 0) merged[i] = r
      else merged.push(r)
    })
    this.setData({ weather: merged })
  },
  go(e) {
    const url = e.currentTarget.dataset.url
    if (url.indexOf('/pages/trip-mode/') === 0) wx.switchTab({ url })
    else wx.navigateTo({ url })
  },
  /* 每日安排天卡 → 日程页定位到对应天（1.5.26 用户需求） */
  goDay(e) {
    const d = Number(e.currentTarget.dataset.d)
    if (!d) return
    wx.navigateTo({ url: '/pages/schedule/schedule?day=' + d })
  },
  /* 导出行程 PDF：容器 pdfkit 生成（封面+每日站点+备注）→ base64 → 本地文件 → 打开/分享（1.5.31） */
  exportPDF() {
    const t = store.trip
    if (!t || !(t.days || []).length) { wx.showToast({ title: '还没有可导出的行程', icon: 'none' }); return }
    const stops = store.stops || []
    const days = t.days.map(day => ({
      d: day.d,
      title: day.title || '',
      date: String(day.date || '').slice(5).replace('-', '.') + (day.week ? ' ' + day.week : ''),
      stops: stops.filter(s => s.day === day.d).map(s => ({
        time: s.time || '', name: s.name || '', place: s.place || '', note: s.note || '', cost: s.cost || 0
      }))
    }))
    if (!days.some(x => x.stops.length)) { wx.showToast({ title: '还没有安排可导出', icon: 'none' }); return }
    wx.showLoading({ title: '生成 PDF…', mask: true })
    api.post('/api/trip/pdf', {
      trip: {
        title: t.title || '我的旅程',
        destination: t.city || t.destination || '',
        dateLabel: this.data.dateLabel || '',
        coverColor: t.coverColor || '#2E92ED',
        coverEmoji: t.coverEmoji || '🧭'
      },
      days
    }).then(res => {
      wx.hideLoading()
      try {
        const fsm = wx.getFileSystemManager()
        const path = wx.env.USER_DATA_PATH + '/trip-' + Date.now() + '.pdf'
        fsm.writeFileSync(path, wx.base64ToArrayBuffer(res.b64 || ''), 'binary')
        wx.openDocument({
          filePath: path, fileType: 'pdf', showMenu: true,
          fail() { wx.showToast({ title: '打开失败，请重试', icon: 'none' }) }
        })
      } catch (e) { wx.showToast({ title: '文件写入失败', icon: 'none' }) }
    }).catch(e => {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '导出失败，请重试', icon: 'none' })
    })
  },
  invite() { wx.navigateTo({ url: '/pages/invite/invite' }) },
  /* ---- 背景图：更换 / 恢复默认 ---- */
  changeCoverBg() {
    const t = store.trip
    if (!t) return
    wx.showActionSheet({
      itemList: t.coverImage ? ['更换背景图', '恢复默认背景'] : ['更换背景图'],
      success: (res) => {
        if (res.tapIndex === 1) {
          (async () => {
            try {
              wx.showLoading({ title: '处理中…', mask: true })
              await store.updateTripMeta(t.id, { coverImage: '' })
              wx.hideLoading()
              this.setData({ coverSrc: '/assets/yichun-lake.jpg' })
              wx.showToast({ title: '已恢复默认', icon: 'success' })
            } catch (e) {
              wx.hideLoading()
              wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
            }
          })()
          return
        }
        wx.chooseMedia({
          count: 1, mediaType: ['image'], sizeType: ['compressed'],
          success: async (r) => {
            const src = r.tempFiles && r.tempFiles[0] && r.tempFiles[0].tempFilePath
            if (!src) return
            try {
              wx.showLoading({ title: '上传中…', mask: true })
              let up = src
              try { const c = await wx.compressImage({ src, quality: 80 }); up = c.tempFilePath } catch (e) { /* 原图兜底 */ }
              const fileID = await storage.uploadImage(up, 'covers')
              await store.updateTripMeta(t.id, { coverImage: fileID })
              const map = await storage.tempUrls([fileID]).catch(() => ({}))
              wx.hideLoading()
              this.setData({ coverSrc: map[fileID] || src })
              wx.showToast({ title: '背景已更新', icon: 'success' })
            } catch (e) {
              wx.hideLoading()
              wx.showToast({ title: (e && e.message) || '上传失败', icon: 'none' })
            }
          }
        })
      }
    })
  },
  onShareAppMessage() {
    const t = store.trip
    return {
      title: (t ? t.title : '一起去旅行') + ' · 行程只读分享',
      path: '/pages/overview/overview?ro=1',
      imageUrl: '/assets/share-cover.jpg'
    }
  },
  noop() {},
  /* ---- 修改行程：目的地 / 出行日期 / 预算 ---- */
  openEdit() {
    const t = store.trip
    if (!t) return
    const s = t.start || todayStr()
    const e = t.endDate || s
    this._orig = { start: s, end: e }
    const budget = Number(t.budgetTotal) || 0
    this.setData({
      editShow: true,
      editDestination: t.destination || '',
      editStart: s,
      editEnd: e,
      editStartCn: md(s),
      editEndCn: md(e),
      editBudget: budget > 0 ? String(budget) : '',
      editRangeTxt: rangeTxt(s, e)
    })
  },
  closeEdit() { if (this.data.editBusy) return; this.setData({ editShow: false }) },
  onEditDest(e) { this.setData({ editDestination: e.detail.value }) },
  onEditBudget(e) { this.setData({ editBudget: e.detail.value }) },
  onEditStart(ev) {
    const v = ev.detail.value
    const patch = { editStart: v, editStartCn: md(v) }
    if (this.data.editEnd && this.data.editEnd < v) {
      patch.editEnd = v
      patch.editEndCn = md(v)
    }
    patch.editRangeTxt = rangeTxt(v, patch.editEnd || this.data.editEnd)
    this.setData(patch)
  },
  onEditEnd(ev) {
    const v = ev.detail.value
    this.setData({
      editEnd: v,
      editEndCn: md(v),
      editRangeTxt: rangeTxt(this.data.editStart, v)
    })
  },
  async saveEdit() {
    if (this.data.editBusy) return
    const t = store.trip
    if (!t) return
    const s = this.data.editStart, e = this.data.editEnd
    if (!s || !e) { wx.showToast({ title: '请选择出行日期', icon: 'none' }); return }
    if (e < s) { wx.showToast({ title: '返程不能早于出发', icon: 'none' }); return }
    const patch = {
      destination: (this.data.editDestination || '').trim(),
      startDate: s,
      endDate: e,
      budget: parseFloat(this.data.editBudget) || 0
    }
    const o = this._orig || {}
    const datesChanged = o.start !== s || o.end !== e
    const shrink = datesChanged && daysBetween(s, e) < daysBetween(o.start, o.end)
    const go = async () => {
      this.setData({ editBusy: true })
      try {
        await store.updateTripInfo(t.id, patch)
        this.setData({ editShow: false, editBusy: false })
        wx.showToast({ title: '行程已更新', icon: 'success' })
        this.boot()
      } catch (err) {
        this.setData({ editBusy: false })
        wx.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' })
      }
    }
    if (shrink) {
      wx.showModal({
        title: '缩短行程日期',
        content: '被移除日期内的安排将一并删除，确定继续吗？',
        confirmText: '继续保存',
        success: (r) => { if (r.confirm) go() }
      })
      return
    }
    go()
  }
})
