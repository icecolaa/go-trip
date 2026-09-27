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
    wx.showModal({
      title: '自定义卡片内容',
      editable: true, placeholderText: '例如：民宿老板推荐的看星星机位',
      success: res => {
        if (res.confirm && res.content) {
          const list = this.loadCustoms()
          list.unshift(res.content.trim())
          try { wx.setStorageSync(CUSTOM_KEY + ':' + this.data.city, list.slice(0, 20)) } catch (e) { /* 忽略 */ }
          this.setData({ customs: list })
        }
      }
    })
  },
  delCustom(e) {
    const i = Number(e.currentTarget.dataset.i)
    const list = this.data.customs.filter((_, k) => k !== i)
    try { wx.setStorageSync(CUSTOM_KEY + ':' + this.data.city, list) } catch (err) { /* 忽略 */ }
    this.setData({ customs: list })
  }
})
