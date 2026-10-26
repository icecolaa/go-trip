const theme = require('../../utils/theme')

const LABELS = { auto: '跟随系统', light: '浅色', dark: '深色' }
/* 版本号：优先取小程序正式版版本号，开发版/体验版/取不到时回落本地兜底。
   教训：曾长期写死 'v1.5.0'，而正式版已迭代到 1.5.32+，关于页显示的版本与实际运行版本
   长期不一致；每次发版靠人记得改一次，必然漂移——改为读正式版本，兜底只服务开发期。 */
const FALLBACK_VERSION = 'v1.5.35'
function currentVersion() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const v = info && info.miniProgram && info.miniProgram.version
    // 正式版返回 x.y.z；开发版为 'develop'、体验版为 'trial' → 一律走兜底
    if (v && /^\d+\.\d+\.\d+/.test(v)) return 'v' + v
  } catch (e) { /* 基础库不支持或异常：回落兜底 */ }
  return FALLBACK_VERSION
}

Page({
  data: { themeClass: '', themeSetting: 'auto', themeLabel: '跟随系统', versionText: currentVersion() },
  onShow() {
    const s = theme.setting()
    this.setData({ themeClass: theme.currentClass(), themeSetting: s, themeLabel: LABELS[s] || '跟随系统' })
  },
  setTheme(e) {
    const v = e.currentTarget.dataset.v
    theme.setSetting(v) // 本地记忆
    this.setData({ themeClass: theme.currentClass(), themeSetting: v, themeLabel: LABELS[v] })
    wx.showToast({ title: LABELS[v], icon: 'none' })
  },
  showAbout() {
    wx.showModal({
      title: '关于出发吧',
      content: '出发吧 GoTrip ' + this.data.versionText + '\n协作行程 · 记账结算 · 打包清单 · 旅行锦囊\n和同行人一起把旅行安排明白',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  goHelper() { wx.navigateTo({ url: '/pages/helper/helper' }) },
  /* 分享指引：只讲真实存在的两条路径——行程总览导出 PDF 后经右上角菜单转发文件；
     转发小程序卡片仅推荐应用，不含行程内容。不涉及只读链接（后端无此路由）。 */
  showShareGuide() {
    wx.showModal({
      title: '分享行程',
      content: '在「行程总览」点击「导出 PDF」生成行程文件，打开文件后点右上角「···」即可转发给好友。\n也可直接转发本小程序卡片，把应用推荐给同行人（卡片不含行程内容）。',
      showCancel: false,
      confirmText: '知道了'
    })
  },
  onShareAppMessage() {
    return {
      title: '出发吧 GoTrip · 一起规划旅行',
      path: '/pages/home/home',
      imageUrl: '/assets/share-cover.jpg'
    }
  }
})
