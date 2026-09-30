const engine = require('../../utils/engine')
const theme = require('../../utils/theme')
const CUSTOM_KEY = 'guidebook-custom'

Page({
  data: { themeClass: '', cities: [], cityCount: 0, city: '伊春', cards: [], customs: [] },
  onShow() {
    const cities = engine.guideCities()
    this.setData({
      themeClass: theme.currentClass(),
      cities, cityCount: cities.length,
      customs: this.loadCustoms()
    }, () => this.refresh())
  },
  loadCustoms() {
    try { return wx.getStorageSync(CUSTOM_KEY + ':' + this.data.city) || [] } catch (e) { return [] }
  },
  refresh() {
    this.setData({ cards: engine.guide(this.data.city) })
  },
  pickCity(e) {
    this.setData({ city: e.currentTarget.dataset.c }, () => {
      this.setData({ customs: this.loadCustoms() }, () => this.refresh())
    })
  },
  addCustom() {
    this.setData({
      cardSheet: {
        show: true,
        fields: [{ key: 'content', label: '卡片内容', placeholder: '例如：民宿老板推荐的看星星机位', type: 'textarea', required: true, maxlength: 100 }]
      }
    })
  },
  closeCardSheet() { this.setData({ 'cardSheet.show': false }) },
  onCardSheet(e) {
    this.setData({ 'cardSheet.show': false })
    const list = this.loadCustoms()
    list.unshift(e.detail.content)
    try { wx.setStorageSync(CUSTOM_KEY + ':' + this.data.city, list.slice(0, 20)) } catch (err) { /* 忽略 */ }
    this.setData({ customs: list })
  },
  delCustom(e) {
    const i = Number(e.currentTarget.dataset.i)
    const list = this.data.customs.filter((_, k) => k !== i)
    try { wx.setStorageSync(CUSTOM_KEY + ':' + this.data.city, list) } catch (err) { /* 忽略 */ }
    this.setData({ customs: list })
  }
})
