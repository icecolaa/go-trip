const store = require('../../utils/store')
const theme = require('../../utils/theme')
const MOODS = ['☀️', '🤩', '😌', '🥾', '📸', '📝']

Page({
  data: {
    themeClass: '', loading: true, noTrip: false,
    entries: [], moods: MOODS,
    composer: false, saving: false,
    form: { moodIdx: 0, text: '', images: [] }
  },
  onShow() { this.setData({ themeClass: theme.currentClass() }); this.boot() },
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
    this.setData({ loading: false, entries: store.journal || [] })
  },
  startAdd() { this.setData({ composer: true, form: { moodIdx: 0, text: '', images: [] } }) },
  cancel() { this.setData({ composer: false }) },
  pickMood(e) { this.setData({ 'form.moodIdx': Number(e.currentTarget.dataset.i) }) },
  onText(e) { this.setData({ 'form.text': e.detail.value }) },
  chooseImages() {
    const left = 9 - this.data.form.images.length
    if (left <= 0) { wx.showToast({ title: '最多 9 张', icon: 'none' }); return }
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'], // 压缩后再上传，省流量
      sourceType: ['album', 'camera'],
      success: res => {
        const paths = res.tempFiles.map(f => f.tempFilePath)
        this.setData({ 'form.images': this.data.form.images.concat(paths) })
      },
      fail: () => { /* 用户取消选图 */ }
    })
  },
  async saveEntry() {
    if (this.data.saving) return
    const { moodIdx, text, images } = this.data.form
    if (!text.trim() && !images.length) { wx.showToast({ title: '写点内容吧', icon: 'none' }); return }
    this.setData({ saving: true })
    wx.showLoading({ title: '发布中', mask: true })
    try {
      await store.publishJournal(text.trim(), MOODS[moodIdx] || '📝', images)
      wx.hideLoading()
      this.setData({ composer: false, saving: false })
      this.refresh()
      wx.showToast({ title: '手记已发布', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: (e && e.message) || '发布失败，请重试', icon: 'none' })
    }
  },
  delEntry(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除这条手记？', content: '删除后不可恢复', confirmColor: '#F0655A',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await store.deleteJournalById(id)
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
