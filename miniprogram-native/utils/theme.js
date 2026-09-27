// 主题：夜间模式（跟随系统偏好 + 手动覆盖 + 本地记忆）
// 机制：
//  - 跟随系统：app.wxss 里 @media (prefers-color-scheme: dark) 的 page{} 令牌
//  - 手动覆盖：页面根节点绑定 currentClass() 返回的 theme-dark / theme-light
//  - 本地记忆：wx.storage 键 gotrip-theme（auto | dark | light）
const KEY = 'gotrip-theme'

function setting() {
  try { return wx.getStorageSync(KEY) || 'auto' } catch (e) { return 'auto' }
}

function setSetting(v) {
  try { wx.setStorageSync(KEY, v) } catch (e) { /* 存储失败静默 */ }
  syncChrome()
}

// 页面根节点 class：手动覆盖时返回对应令牌类；auto 时交由媒体查询
function currentClass() {
  const s = setting()
  if (s === 'dark') return 'theme-dark'
  if (s === 'light') return 'theme-light'
  return ''
}

// 自定义导航下，系统状态栏前景色仍由 setNavigationBarColor 控制
function syncChrome() {
  const s = setting()
  let dark = false
  if (s === 'dark') dark = true
  else if (s === 'light') dark = false
  else dark = (wx.getAppBaseInfo && wx.getAppBaseInfo().theme === 'dark')
  try {
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#0D1724' : '#F3F8FC'
    })
  } catch (e) { /* 部分环境不支持 */ }
}

module.exports = { setting, setSetting, currentClass, syncChrome, KEY }
