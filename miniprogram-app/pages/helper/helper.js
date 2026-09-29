const store = require('../../utils/store')
const theme = require('../../utils/theme')

// 内置规则指南：12 组关键词问答（本地匹配，不调接口）
const GUIDE_QA = [
  { k: ['记账', 'AA', '垫付', '分摊'], a: '在「行程总览 → 记账」点右下角「记一笔」：选分类 → 填金额 → 选垫付人 → 选分摊方式（平均/按比例/指定人）。所有人记账自动汇总，去「智能结算」可一键生成转账最少的结清方案。' },
  { k: ['邀请', '同伴', '加入'], a: '「行程总览 → 成员条右侧 +」或「我的 → 消息」：支持微信好友分享、朋友圈、复制链接、面对面扫码四种方式，成员进来自动获得日程与记账编辑权。' },
  { k: ['出发模式', '下一站', '勾选'], a: '「行程总览 → 出发模式」是全屏当天视图：按天切换、逐站打勾记录进度，系统自动高亮「下一站」并估算站间距离；路线概览图已缓存，断网也能看。' },
  { k: ['锦囊', '手册', '攻略卡'], a: '「旅行锦囊」按目的地生成美食、贴士、语言、拍摄四类卡片，内置 20+ 城市内容库；内容由内置指南生成，也可添加成员自定义卡片。' },
  { k: ['打包', '清单', '行李'], a: '「打包清单」内置证件/衣物/电子/洗护/药品五类中国出行模板，勾选记进度，每件物品可设数量和备注，支持自定义添加。' },
  { k: ['日志', '手记', '照片'], a: '「旅行日志」按天写图文心情手记：选天数、写文字、传多图（自动压缩出缩略图），写完随时可编辑或删除。' },
  { k: ['收藏', '链接', '小红书', '公众号'], a: '「攻略收藏」粘贴小红书/公众号文章链接并备注标题，列表一键直达（复制链接打开）。行程页的「攻略导入」可把攻略文本直接转成结构化行程预览。' },
  { k: ['飞哪儿', '机票', '低价'], a: '「我的 → 飞哪儿」输入出发地、目的地和日期，支持往返/单程探索低价组合，按人数精确计价，并附目的地天气与出行建议；还能定位识别出发地。' },
  { k: ['夜间', '深色', '暗', '主题'], a: '「我的 → 设置 → 夜间模式」：可跟随系统（默认）、强制浅色或深色，选择会本地记忆，下次打开仍生效。' },
  { k: ['分享', '长辈', '只读'], a: '「我的 → 设置 → 对外分享」生成只读分享链接，对方只能看不能改，适合发给长辈或不参与规划的同行人；微信里也可直接转发小程序卡片。' },
  { k: ['天气', '下雨', '温度'], a: '「行程总览 → 天气速览」展示行程日期窗口内目的地逐日天气与提示；飞哪儿搜索结果里也带目的地天气。' },
  { k: ['结算', '转账', '结清'], a: '「智能结算」用最少转账算法把所有人的应收应付压成 2-3 笔转账，支持「标记已转」，全部结清后可导出账单报告。' }
]

function guideAnswer(q) {
  const text = (q || '').trim()
  if (!text) return ''
  let best = null
  let bestScore = 0
  GUIDE_QA.forEach((item) => {
    const score = item.k.reduce((n, kw) => n + (text.indexOf(kw) >= 0 ? kw.length : 0), 0)
    if (score > bestScore) { bestScore = score; best = item }
  })
  if (best) return best.a
  return '这个问题我还没学过～可以换个问法，或到「行程总览」逐个功能试用：日程、地图、记账、清单、锦囊、日志、收藏、飞哪儿都在那里。'
}

const SUGGESTED = ['怎么记账和结算？', '怎么邀请同伴？', '出发模式是什么？', '怎么切换夜间模式？', '怎么收藏攻略？', '只读分享怎么用？']

Page({
  data: {
    themeClass: '',
    draft: '',
    lastId: '',
    qa: [],
    engineTag: '内置指南'
  },
  onLoad() {
    const qa = SUGGESTED.map((q, i) => ({ q, a: guideAnswer(q), open: i === 0 }))
    this.setData({ qa })
  },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try { await store.ready() } catch (e) { /* 指南内容全本地，静默降级 */ }
  },
  onInput(e) { this.setData({ draft: e.detail.value }) },
  ask(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.setData({ ['qa[' + i + '].open']: !this.data.qa[i].open })
  },
  send() { this.askText(this.data.draft) },
  askText(raw) {
    const q = (raw || '').trim()
    if (!q) return
    const a = guideAnswer(q)
    const qa = this.data.qa
    qa.unshift({ q, a, open: true })
    this.setData({ qa: qa.slice(0, 30), draft: '', lastId: 'qa0' })
  }
})
