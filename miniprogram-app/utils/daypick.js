/** 天选择 ActionSheet：wx.showActionSheet 的 itemList 官方上限 6 项，
 * 超限直接 fail 且无 fail 回调时表现为「点击无反应」（7 天行程实锤）。
 * ≤6 天单层直选；>6 天自动按 6 个一组分两跳。resolve(day)，取消/失败 resolve(null)。 */
function pickDay(days) {
  const label = d => 'D' + d.d + ' · ' + d.date
  if (days.length <= 6) {
    return new Promise(resolve => {
      wx.showActionSheet({
        itemList: days.map(label),
        success: res => resolve(days[res.tapIndex] || null),
        fail: () => resolve(null)
      })
    })
  }
  const CHUNK = 6
  const groups = []
  for (let i = 0; i < days.length; i += CHUNK)
    groups.push(days.slice(i, i + CHUNK))
  return new Promise(resolve => {
    wx.showActionSheet({
      itemList: groups.map(g => g.length === 1
        ? 'D' + g[0].d
        : 'D' + g[0].d + '–D' + g[g.length - 1].d + '（' + g.length + ' 天）'),
      success: res => {
        const g = groups[res.tapIndex]
        if (!g) return resolve(null)
        wx.showActionSheet({
          itemList: g.map(label),
          success: r2 => resolve(g[r2.tapIndex] || null),
          fail: () => resolve(null)
        })
      },
      fail: () => resolve(null)
    })
  })
}

module.exports = { pickDay }
