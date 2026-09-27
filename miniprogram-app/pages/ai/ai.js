const api = require('../../utils/api')
const store = require('../../utils/store')
const theme = require('../../utils/theme')

let nextId = 100

// 本地关键词应答（12 组，不调接口）
const CHAT_QA = [
  { k: ['行程', '规划', '安排', '路线'], a: '到「生成行程」选目的地、天数和节奏，我帮你排一份逐日草案；也可以把攻略文本粘到「解析攻略」，整理成结构化行程预览。' },
  { k: ['记账', 'AA', '垫付', '分摊'], a: '在「行程总览 → 记账」点「记一笔」：选分类、填金额、选垫付人和分摊人。去「智能结算」还能一键生成转账最少的结清方案。' },
  { k: ['预算', '花销', '花多少'], a: '每笔记账会自动汇总到行程预算里，总览页能看到预算余量；多人账目在「智能结算」里按人均摊。' },
  { k: ['行李', '清单', '打包', '带什么'], a: '「打包清单」内置证件/衣物/电子/洗护/药品五类模板，勾选记进度，每件可设数量和备注，也能自定义添加。' },
  { k: ['美食', '吃', '餐厅', '小吃'], a: '「旅行锦囊」按目的地整理美食、贴士、语言、拍摄四类卡片，先看看当地必吃清单，再决定排进哪一天的晚餐。' },
  { k: ['天气', '下雨', '温度', '穿'], a: '「行程总览 → 天气速览」展示行程日期内目的地逐日天气；「飞哪儿」搜索结果里也带目的地天气与穿搭建议。' },
  { k: ['邀请', '同伴', '一起', '加入'], a: '「行程总览 → 成员条右侧 +」可邀请同伴：微信好友、朋友圈、复制链接、面对面扫码四种方式，进来就能一起编辑日程和记账。' },
  { k: ['夜间', '深色', '暗', '主题'], a: '「我的 → 设置 → 夜间模式」可跟随系统或强制浅色/深色，选择会本地记忆，下次打开仍生效。' },
  { k: ['机票', '低价', '飞', '航班'], a: '「我的 → 飞哪儿」输入出发地和日期就能探索低价组合，支持往返/单程，按人数精确计价，还能定位识别出发地。' },
  { k: ['结算', '转账', '结清'], a: '「智能结算」把所有人的应收应付压成最少的几笔转账，支持标记已转，全部结清后可导出账单报告。' },
  { k: ['日志', '照片', '手记', '记录'], a: '「旅行日志」按天写图文手记：选天数、写文字、传多图（自动压缩），写完随时可编辑或删除。' },
  { k: ['收藏', '攻略', '小红书', '链接'], a: '「攻略收藏」粘贴文章链接并备注标题，列表一键直达；配合本页「解析攻略」可把攻略文本整理成结构化行程预览。' }
]

function localReply(q) {
  const text = (q || '').trim()
  if (!text) return ''
  let best = null
  let bestScore = 0
  CHAT_QA.forEach((item) => {
    const score = item.k.reduce((n, kw) => n + (text.indexOf(kw) >= 0 ? kw.length : 0), 0)
    if (score > bestScore) { bestScore = score; best = item }
  })
  if (best) return best.a
  return '这个问题我还没学过～可以换个问法，或到「行程总览」逐个功能试用：日程、地图、记账、清单、锦囊、日志、收藏、飞哪儿都在那里。'
}

Page({
  data: {
    themeClass: '',
    mode: 'chat',
    draft: '',
    lastId: '',
    engineTag: '内置指南',
    messages: [
      { id: 1, role: 'ai', text: '嗨，我是你的行程助手 🐶 可以解析攻略、生成行程草案，也能聊聊行程安排。试试下方的快捷问题吧。' }
    ],
    pasteText: '',
    parsed: null,
    parseBusy: false,
    prefOptions: ['摄影', '美食', '亲子', '徒步'],
    gen: { dest: '', days: 3, pace: '适中', prefs: [] },
    generated: null,
    genBusy: false
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try { await store.ready() } catch (e) { /* 对话模式不依赖行程，静默降级 */ }
  },
  setMode(e) { this.setData({ mode: e.currentTarget.dataset.m }) },

  // ---------- 对话（本地关键词应答，不调接口） ----------
  onInput(e) { this.setData({ draft: e.detail.value }) },
  quick(e) { this.sendText(e.currentTarget.dataset.q) },
  send() { this.sendText(this.data.draft) },
  sendText(text) {
    const t = (text || '').trim()
    if (!t) return
    const { messages } = this.data
    const meId = nextId++
    const botId = nextId++
    const next = [...messages,
      { id: meId, role: 'me', text: t },
      { id: botId, role: 'ai', text: localReply(t) }
    ]
    this.setData({ messages: next, draft: '', lastId: 'm' + botId })
  },

  // ---------- 解析攻略（预览，不落库） ----------
  onPaste(e) { this.setData({ pasteText: e.detail.value }) },
  doParse() {
    if (this.data.parseBusy) return
    const text = (this.data.pasteText || '').trim()
    if (!text) { wx.showToast({ title: '先粘贴攻略文本', icon: 'none' }); return }
    const tripId = store.currentTripId()
    if (!tripId) { wx.showToast({ title: '请先从首页选择行程', icon: 'none' }); return }
    this.setData({ parseBusy: true })
    wx.showLoading({ title: '解析中', mask: true })
    api.post('/api/trips/' + tripId + '/ai/parse-guide', { text })
      .then((r) => {
        const days = ((r && r.days) || []).filter((d) => d && ((d.activities || []).length || d.title))
        if (!days.length) {
          wx.showToast({ title: '没解析出有效内容，换个文本试试', icon: 'none' })
          return
        }
        this.setData({
          parsed: {
            source: (r && r.source) || '',
            days: days.map((d) => ({
              title: d.title || (d.dayNumber ? '第 ' + d.dayNumber + ' 天' : '当天'),
              stops: (d.activities || []).map((a) => a && a.title).filter(Boolean).join(' → ')
            }))
          }
        })
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '解析超时/失败，请重试', icon: 'none' }))
      .then(() => {
        wx.hideLoading()
        this.setData({ parseBusy: false })
      })
  },

  // ---------- 生成行程（预览，不落库） ----------
  onGenDest(e) { this.setData({ 'gen.dest': e.detail.value }) },
  onGenDays(e) { this.setData({ 'gen.days': Number(e.detail.value) + 1 }) },
  onGenPace(e) {
    const i = Number(e.detail.value)
    this.setData({ 'gen.pace': ['紧凑', '适中', '松弛'][i] || '适中' })
  },
  togglePref(e) {
    const p = e.currentTarget.dataset.p
    const prefs = this.data.gen.prefs.slice()
    const i = prefs.indexOf(p)
    if (i >= 0) prefs.splice(i, 1); else prefs.push(p)
    this.setData({ 'gen.prefs': prefs })
  },
  doGenerate() {
    if (this.data.genBusy) return
    const { dest, days, pace, prefs } = this.data.gen
    if (!dest.trim()) { wx.showToast({ title: '填一下目的地', icon: 'none' }); return }
    this.setData({ genBusy: true })
    wx.showLoading({ title: '生成中', mask: true })
    api.post('/api/ai/generate', { city: dest.trim(), days, pace, interests: prefs })
      .then((r) => {
        const planDays = ((r && r.days) || []).filter((d) => d)
        if (!planDays.length) {
          wx.showToast({ title: '没生成出内容，请重试', icon: 'none' })
          return
        }
        this.setData({
          generated: {
            source: (r && r.source) || '',
            days: planDays.map((d) => ({
              title: d.title || (d.dayNumber ? '第 ' + d.dayNumber + ' 天' : '当天'),
              stops: (d.activities || []).map((a) => a && a.title).filter(Boolean).join(' → ')
            }))
          }
        })
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '生成超时/失败，请重试', icon: 'none' }))
      .then(() => {
        wx.hideLoading()
        this.setData({ genBusy: false })
      })
  }
})
