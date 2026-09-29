// 全局共享 mock 数据（与设计稿故事线一致）
// 接后端时：本文件替换为 API 层，字段结构即数据字典

const trip = {
  id: 't20261002',
  title: '伊春 · 五花山赏秋',
  city: '伊春',
  start: '2026-10-02',
  days: [
    { d: 1, date: '10.02', week: '周五', title: '抵达伊春 · 林都夜色' },
    { d: 2, date: '10.03', week: '周六', title: '五营 · 汤旺河一日' },
    { d: 3, date: '10.04', week: '周日', title: '茅兰沟 · 峡谷秋色' },
    { d: 4, date: '10.05', week: '周一', title: '返程' }
  ],
  budgetTotal: 4000,
  members: [
    { name: '阿哲', initial: '哲', av: 'av-blue' },
    { name: '李娜', initial: '李', av: 'av-yellow' },
    { name: '王胖', initial: '王', av: 'av-green' },
    { name: '陈晨', initial: '陈', av: 'av-coral' }
  ]
}

// 每日行程 stops：时间 / 地点 / 坐标 / 费用 / 备注 / 所属天；mx/my 为地图页底图上的百分比锚点
const stops = [
  { id: 101, day: 1, time: '14:00', name: '伊春站', type: '交通', cost: 0, note: '接站', lat: 47.727, lng: 128.899, mx: 22, my: 78 },
  { id: 102, day: 1, time: '15:00', name: '木兰民宿', type: '住宿', cost: 964, note: '2 晚 · 已订', lat: 47.729, lng: 128.903, mx: 34, my: 66 },
  { id: 103, day: 1, time: '18:30', name: '林都烤肉', type: '餐饮', cost: 238, note: '李娜推荐', lat: 47.731, lng: 128.91, mx: 44, my: 58 },
  { id: 104, day: 2, time: '08:30', name: '早餐 · 木兰民宿', type: '餐饮', cost: 0, note: '含早', lat: 47.729, lng: 128.903, mx: 34, my: 66 },
  { id: 105, day: 2, time: '09:30', name: '五营国家森林公园', type: '门票', cost: 60, note: '红松林 · 拍照主力', lat: 47.76, lng: 129.25, mx: 48, my: 44 },
  { id: 106, day: 2, time: '13:00', name: '午餐 · 铁锅炖', type: '餐饮', cost: 55, note: '人均 · 王胖推荐', lat: 47.775, lng: 129.28, mx: 58, my: 36 },
  { id: 107, day: 2, time: '15:00', name: '汤旺河林海奇石', type: '门票', cost: 65, note: '地质奇观 · 3h', lat: 47.85, lng: 129.35, mx: 70, my: 30 },
  { id: 108, day: 2, time: '19:00', name: '晚餐 + 入住', type: '住宿', cost: 0, note: '回市区', lat: 47.729, lng: 128.903, mx: 34, my: 66 },
  { id: 109, day: 3, time: '08:00', name: '茅兰沟国家森林公园', type: '门票', cost: 45, note: '峡谷瀑布 · 4h', lat: 48.05, lng: 129.55, mx: 82, my: 20 },
  { id: 110, day: 3, time: '14:00', name: '兴安森林公园', type: '游玩', cost: 0, note: '观景塔日落', lat: 47.735, lng: 128.92, mx: 40, my: 52 },
  { id: 111, day: 4, time: '10:00', name: '伊春站', type: '交通', cost: 0, note: '返程', lat: 47.727, lng: 128.899, mx: 22, my: 78 }
]

// 记账：payerIdx 对应 trip.members 下标；splitN 为分摊人数
const bills = [
  { id: 1, day: '10月3日 · 今天', title: '五营森林公园门票 ×4', cat: 'ticket', catBg: 'sky', catColor: '#2E92ED', payerIdx: 0, splitN: 4, amount: 240 },
  { id: 2, day: '10月3日 · 今天', title: '午餐 · 铁锅炖', cat: 'food', catBg: 'yel', catColor: '#FFC414', payerIdx: 2, splitN: 3, sharers: [0, 1, 2], amount: 132 },
  { id: 3, day: '10月2日 · 昨天', title: '木兰民宿 · 2 晚', cat: 'bed', catBg: 'tea', catColor: '#2BB8A8', payerIdx: 0, splitN: 4, amount: 964 },
  { id: 4, day: '10月2日 · 昨天', title: '晚餐 · 林都烤肉', cat: 'food', catBg: 'yel', catColor: '#FFC414', payerIdx: 1, splitN: 4, amount: 238 },
  { id: 5, day: '10月2日 · 昨天', title: '加油 · 接站往返', cat: 'car', catBg: 'grn', catColor: '#2FA96E', payerIdx: 2, splitN: 4, amount: 260 }
]

// 成员动态流
const feed = [
  { name: '你', initial: '哲', av: 'av-blue', action: ' 优化了 D2 路线', desc: '使用高德路线规划 · 车程缩短 22 分钟', time: '09:12' },
  { name: 'AI 小助手', ai: true, action: ' 生成了行程建议', desc: 'D3 下午空档 3 小时 · 推荐「茅兰沟」等 3 个地点', time: '11:20', tagc: 'blue', tagTxt: '可一键采用' },
  { name: '李娜', initial: '李', av: 'av-yellow', action: ' 添加了景点', desc: '「汤旺河林海奇石」已加入 D2 行程', time: '12:30', tagc: 'yellow', tagTxt: '新' },
  { name: '王胖', initial: '王', av: 'av-green', action: ' 记了一笔账', desc: '午餐 · 铁锅炖 ¥132 · 3 人均摊', time: '13:05' },
  { name: '陈晨', initial: '陈', av: 'av-coral', action: ' 接受了邀请', desc: '已加入「伊春 · 五花山赏秋」', time: '昨天' }
]

module.exports = { trip, stops, bills, feed }
