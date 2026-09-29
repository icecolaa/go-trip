const store = require('../../utils/store')
const theme = require('../../utils/theme')

function hostOf(url) {
  const m = String(url || '').match(/^[a-zA-Z]+:\/\/([^/?#]+)/)
  return m ? m[1] : ''
}

Page({
  data: { themeClass: '', loading: true, noTrip: false, links: [] },
  onShow() {
    this.setData({ themeClass: theme.currentClass() })
    this.boot()
  },
  async boot() {
    try {
      await store.ready()
      if (!store.trip || !store.trip.id) { this.setData({ loading: false, noTrip: true }); return }
      this.setData({ noTrip: false })
      this.refresh()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
  },
  refresh() {
    this.setData({ loading: false, links: store.links || [] })
  },
  addLink() {
    wx.showModal({
      title: '粘贴链接', editable: true,
      placeholderText: 'https://www.xiaohongshu.com/… 或公众号文章链接',
      success: res => {
        if (!res.confirm || !(res.content || '').trim()) return
        const url = res.content.trim()
        const host = hostOf(url)
        if (!host) { wx.showToast({ title: '链接格式不对，请检查', icon: 'none' }); return }
        wx.showModal({
          title: '备注标题', editable: true,
          placeholderText: '留空则使用 ' + host,
          success: res2 => {
            if (!res2.confirm) return
            const title = (res2.content || '').trim() || host
            this.saveLink(title, url)
          }
        })
      }
    })
  },
  async saveLink(title, url) {
    wx.showLoading({ title: '保存中', mask: true })
    try {
      await store.addLink(title, url) // 内部已按 URL 识别来源并刷新
      wx.hideLoading()
      this.refresh()
      wx.showToast({ title: '已收藏', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '收藏失败，请重试', icon: 'none' })
    }
  },
  openLink(e) {
    const item = this.data.links[Number(e.currentTarget.dataset.i)]
    if (!item || !item.url) return
    // 小程序无法直接打开外部网页（需配置业务域名）；复制链接一键直达
    wx.setClipboardData({
      data: item.url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
    })
  },
  delLink(e) {
    const i = Number(e.currentTarget.dataset.i)
    const item = this.data.links[i]
    if (!item) return
    wx.showModal({
      title: '删除「' + (item.title || '该收藏') + '」？', content: '删除后不可恢复', confirmColor: '#F0655A',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await store.deleteLinkById(item.id)
          wx.hideLoading()
          this.refresh()
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
