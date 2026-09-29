// 规则引擎集合：所有「智能」功能在未配置大模型/外部 API 时的降级实现
// 接入真实服务：把各 engine 的实现替换为 wx.request 调用自托管后端即可，页面无需改动

const { trip } = require('./data')

// ============ 通用 ============
const AI_CONFIGURED = false // 接入大模型后置 true（经自托管后端转发，密钥不落前端）

function haversineKm(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(s))
}

// 站间估算：距离 + 假定均速 45km/h 的车程
function legEstimate(a, b) {
  const km = Math.max(0.3, haversineKm(a, b) * 1.25) // 路网系数
  const min = Math.max(5, Math.round(km / 45 * 60))
  return { km: Math.round(km * 10) / 10, min }
}

// ============ 最少转账结算（贪心最小现金流，分为单位避免取整误差） ============
// bills: [{amount, payerIdx, splitN}]，members N 人 → 转账笔数 ≤ N-1 的方案
function settle(bills, members) {
  const bal = members.map(() => 0) // 单位：分
  bills.forEach(b => {
    const cents = Math.round(b.amount * 100)
    const sharers = b.sharers || members.map((_, i) => i)
    bal[b.payerIdx] += cents
    const share = Math.round(cents / sharers.length)
    sharers.forEach(i => { bal[i] -= share })
    // 取整余数记回垫付人，保证总额守恒
    bal[b.payerIdx] += cents - share * sharers.length
  })
  const creditors = [], debtors = []
  bal.forEach((v, i) => {
    const r = { idx: i, val: v }
    if (r.val > 0) creditors.push(r)
    else if (r.val < 0) debtors.push({ ...r, val: -r.val })
  })
  creditors.sort((a, b) => b.val - a.val)
  debtors.sort((a, b) => b.val - a.val)
  const transfers = []
  let ci = 0, di = 0
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci], d = debtors[di]
    const amt = Math.min(c.val, d.val)
    if (amt > 0) {
      transfers.push({
        fromIdx: d.idx, toIdx: c.idx,
        amount: Math.round(amt / 100 * 10) / 10, // 元，保留 1 位
        from: members[d.idx], to: members[c.idx]
      })
    }
    c.val -= amt; d.val -= amt
    if (c.val <= 0) ci++
    if (d.val <= 0) di++
  }
  return { balances: bal.map(v => Math.round(v / 100 * 10) / 10), transfers }
}

// ============ 天气速览（行程日期窗口，确定性伪随机） ============
const WEATHER_ICONS = ['☀️ 晴', '🌤 多云', '⛅ 局部多云', '🌫 晨雾', '🌧 小雨']
const CITY_CLIMATE = { '伊春': [3, 14], '大理': [8, 20], '三亚': [24, 30], '成都': [14, 21], '西安': [10, 19], '北京': [9, 19] }

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function weather(city, startISO, n) {
  const [lo, hi] = CITY_CLIMATE[city] || [8, 17]
  const start = new Date(startISO + 'T00:00:00')
  const out = []
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    const seed = hash(city + d.toISOString().slice(0, 10))
    const w = WEATHER_ICONS[seed % WEATHER_ICONS.length]
    const dayHi = hi - (seed % 4) + (i % 3)
    const dayLo = lo + (seed % 3)
    out.push({
      date: (d.getMonth() + 1) + '.' + d.getDate(),
      icon: w, hi: dayHi, lo: dayLo,
      tip: w.indexOf('雨') >= 0 ? '带雨具' : (dayHi - dayLo > 9 ? '早晚温差大' : '适宜出行')
    })
  }
  return out
}

// ============ 飞哪儿：低价组合（规则引擎） ============
const FLIGHT_BASE = { '伊春': 680, '大理': 760, '三亚': 980, '成都': 820, '西安': 750, '哈尔滨': 420, '上海': 620, '广州': 780 }

function flights(from, to, dateISO, pax) {
  const base = FLIGHT_BASE[to] || 880
  const seed = hash(from + to + dateISO)
  const tax = 120
  const mk = (type, factor, note) => {
    const price = Math.round(base * factor / 10) * 10
    return {
      type, note,
      price, pricePax: price + tax,
      total: (price + tax) * pax,
      depart: (6 + seed % 8) + ':' + (seed % 2 ? '35' : '10'),
      arrive: (8 + seed % 8) + ':' + (seed % 2 ? '50' : '25')
    }
  }
  return {
    pax, tax,
    combos: [
      mk('早鸟特惠', 0.82, '提前 14 天 · 剩 3 张'),
      mk('直飞推荐', 1.0, '全程 2h40m · 行李直挂'),
      mk('中转省钱', 0.72, '哈尔滨中转 · +2.5h')
    ]
  }
}

function travelTip(city, wx4) {
  const rain = wx4.filter(d => d.icon.indexOf('雨') >= 0).length
  const tips = []
  if (rain > 0) tips.push('行程内有 ' + rain + ' 天降雨概率，雨具备好')
  else tips.push('整体天气稳定，适合户外行程')
  const span = Math.max(...wx4.map(d => d.hi - d.lo))
  if (span >= 9) tips.push('昼夜温差约 ' + span + '°C，洋葱式穿搭')
  const dest = { '伊春': '林区早晚近 0°C，手套帽子值得带', '三亚': '紫外线强，防晒霜 SPF50+', '大理': '洱海风大，防风外套实用' }
  tips.push(dest[city] || '出发前 3 天再确认一次票价与天气')
  return tips
}

// ============ 旅行锦囊：内置内容库（20+ 目的地） ============
// cat: food 美食 / tips 贴士 / lang 语言 / photo 拍摄
const GUIDE_LIBRARY = {
  '伊春': {
    food: ['铁锅炖江鱼 · 民宿常备', '山野菜包子 · 春秋季限定', '蓝莓制品 · 小兴安岭特产'],
    tips: ['林区早晚近 0°C，防风外套必备', '森林公园间距离远，自驾最稳', '10 月初五花山进入最佳观赏期'],
    lang: ['「上哪儿去？」= 去哪里', '「贼好吃」= 非常好吃', '普通话通用，语速偏慢'],
    photo: ['五花山航拍 · 午前侧光最佳', '五营红松林 · 仰拍 + 雾天', '汤旺河石林 · 傍晚金光']
  },
  '大理': {
    food: ['乳扇 + 玫瑰酱', '酸辣鱼 · 洱海边老店', '喜洲粑粑 · 破酥现烤'],
    tips: ['洱海风大，防风外套实用', '环海电动车记得要满电', '紫外线强，物理防晒优先'],
    lang: ['「阿鹏」「金花」= 小伙/姑娘', '白族「三道茶」一苦二甜三回味'],
    photo: ['洱海日出 · 才村码头', 'S 弯公路 · 上午顺光', '苍山雪 + 古城夜景蓝调时刻']
  },
  '三亚': {
    food: ['文昌鸡 · 白切蘸橘酱', '清补凉 · 椰奶底', '和乐蟹 · 秋季最肥'],
    tips: ['紫外线强，防晒霜 SPF50+', '海鲜市场自购找加工店', '台风季关注 9-10 月预报'],
    lang: ['「老爸茶」= 街边茶点文化', '「闷」= 潜水下水'],
    photo: ['椰林逆光 · 日落前 1h', '海棠湾无人机海色', '夜市烟火 · 大光圈']
  },
  '成都': {
    food: ['火锅 · 微辣起步', '冒烤鸭 · 排队店早去', '蛋烘糕 · 街边 sweetness'],
    tips: ['市区地铁够用，景区租车', '熊猫基地早上 8 点前到', '茶馆掏耳朵值得体验'],
    lang: ['「巴适」= 舒服/棒', '「摆龙门阵」= 聊天', '「要得」= 好的'],
    photo: ['太古里夜景 · 霓虹', '人民公园茶馆人文', '雪山同框 · 雨后高楼西望']
  },
  '西安': {
    food: ['肉夹馍 · 腊牛肉为尊', '羊肉泡馍 · 自己掰馍', '甑糕 · 早市限定'],
    tips: ['城墙骑行 2h 全程', '陕历博需提前预约', '回民街主街贵，巷内更深'],
    lang: ['「嘹咋咧」= 太好了', '「克里马擦」= 赶紧的'],
    photo: ['大唐不夜城 · 夜景人像', '城墙角楼 · 蓝调', '兵马俑 · 长焦压缩']
  },
  '北京': { food: ['铜锅涮肉 · 清水锅底', '炸酱面 · 手擀面码', '豆汁儿 · 勇者挑战'], tips: ['景点全部提前预约', '地铁最省时，早晚高峰避开', '秋季银杏 10 月底最佳'], lang: ['「您呐」= 敬语后缀', '「甭」= 不用'], photo: ['故宫角楼 · 日落', '慕田峪长城 · 晴天上午', '胡同秋色 · 鼓楼一带'] },
  '上海': { food: ['生煎 · 底脆汤多', '蟹粉小笼', '葱油拌面'], tips: ['外滩晚上 10 点熄灯前到', '地铁四通八达', '迪士尼早享卡值得'], lang: ['「灵」= 好', '「侬」= 你'], photo: ['外滩万国建筑 · 蓝调', '武康路梧桐 · 上午', '陆家嘴三件套 · 长焦'] },
  '杭州': { food: ['西湖醋鱼 · 楼外楼', '片儿川 · 早面', '龙井虾仁'], tips: ['西湖环湖电瓶车分段坐', '灵隐寺早去避人流', '雨中西湖别有味道'], lang: ['「儿化」多且软', '「莫牢牢」= 很多'], photo: ['断桥残雪 · 冬晨', '九溪烟树 · 秋', '雷峰塔日落 · 长桥'] },
  '重庆': { food: ['小面 · 微辣提香', '九宫格火锅', '烤苕皮'], tips: ['导航会失灵，问当地人', '轻轨穿楼 2 号线李子坝', '夜景观景台一 bóng 足够'], lang: ['「要得」= 好的', '「莫得」= 没有', '「崽儿」= 小伙'], photo: ['洪崖洞 · 夜', '长江索道 · 傍晚', '山城步道 · 立体感'] },
  '广州': { food: ['早茶四大天王', '煲仔饭 · 煲焦香', '糖水 · 双皮奶'], tips: ['早茶早去 7 点前', '地铁广', '回南天注意防潮'], lang: ['「饮茶先啦」', '「咁样」= 这样', '「系咪」= 是不是'], photo: ['沙面欧式 · 上午', '珠江夜游 · 蓝调', '老骑楼 · 人文'] },
  '厦门': { food: ['沙茶面 · 加料自由', '海蛎煎', '花生汤'], tips: ['鼓浪屿船票提前订', '环岛路骑行傍晚', '台风季 7-9 月关注'], lang: ['「呷饭」= 吃饭', '「水」= 漂亮'], photo: ['鼓浪屿老别墅', '环岛路海岸线 · 傍晚', '猫街涂鸦'] },
  '青岛': { food: ['袋装散啤 + 蛤蜊', '鲅鱼水饺', '烤鱿鱼'], tips: ['8 月啤酒节人爆多', '海边风大', '栈桥早上人少'], lang: ['「哈啤酒」= 喝啤酒', '「小嫚」= 姑娘'], photo: ['八大关秋色', '小青岛灯塔 · 日落', '红瓦绿树 · 信号山俯瞰'] },
  '哈尔滨': { food: ['锅包肉 · 老式做法', '红肠 + 大列巴', '铁锅炖'], tips: ['冬季 -20°C 装备拉满', '冰雪大世界夜场', '中央大街人少在清晨'], lang: ['「嘎哈」= 干啥', '「老」= 很'], photo: ['索菲亚教堂 · 雪夜', '雪乡炊烟 · 清晨', '松花江冰面 · 黄昏'] },
  '长沙': { food: ['臭豆腐 · 黑色经典', '小龙虾 · 口味虾', '茶颜悦色'], tips: ['夜生活到凌晨 2 点', '橘子洲头焰火节假日晚', '地铁直达多数景点'], lang: ['「恰」= 吃', '「霸得蛮」= 耐得烦'], photo: ['IFS 楼顶 · 夜', '岳麓山爱晚亭 · 秋', '文和友 · 人文'] },
  '武汉': { food: ['热干面 · 过早首选', '豆皮 · 老通城', '糊汤粉 + 油条'], tips: ['长江大桥步行过江', '樱花季 3 月底', '过早文化：边走边吃'], lang: ['「过早」= 吃早餐', '「冇得」= 没有'], photo: ['黄鹤楼 · 夜', '东湖绿道 · 秋', '长江大桥 · 蓝调'] },
  '拉萨': { food: ['甜茶馆 · 本地日常', '酥油茶 + 糌粑', '藏面'], tips: ['前 2 天慢节奏防高反', '布宫票提前 1 天约', '紫外线极强'], lang: ['「扎西德勒」= 吉祥如意', '「突及其」= 谢谢'], photo: ['布宫倒影 · 清晨', '大昭寺人文', '纳木错星空'] },
  '乌鲁木齐': { food: ['大盘鸡 · 皮带面', '烤包子 · 馕坑现烤', '手抓饭'], tips: ['时差 2h，饭点偏晚', '安检常态化带身份证', '北疆环线包车最稳'], lang: ['「亚克西」= 好', '「热合麦特」= 谢谢'], photo: ['天山天池 · 上午', '大巴扎 · 夜', '独库公路 · 航拍'] },
  '桂林': { food: ['桂林米粉 · 卤菜粉', '啤酒鱼 · 阳朔', '油茶'], tips: ['漓江竹筏分段票', '阳朔西街夜市', '雨后漓江烟雾最美'], lang: ['「克哪凯」= 去哪里', '「韵味」= 有味道'], photo: ['漓江 20 元背景 · 上午', '相公山日出 · 云海', '遇龙河竹筏'] },
  '丽江': { food: ['腊排骨火锅', '鸡豆凉粉', '纳西烤鱼'], tips: ['古城维护费凭证留好', '玉龙雪山防高反+氧气', '紫外线强且干燥'], lang: ['纳西语「阿妈意」= 亲切称呼'], photo: ['玉龙雪山 · 蓝月谷', '古城全景 · 狮子山', '黑龙潭倒雪山'] },
  '西双版纳': { food: ['菠萝饭 · 香竹烤', '傣味烧烤 · 夜市', '舂鸡脚'], tips: ['泼水节 4 月中', '雨季蚊虫多', '佛寺进殿脱鞋'], lang: ['「水水水」= 好棒', '「骚哆哩」= 姑娘'], photo: ['告庄星光夜市', '总佛寺金顶', '望天树雨林'] },
  '张家界': { food: ['三下锅 · 干锅', '土家腊肉', '岩耳炖土鸡'], tips: ['玻璃桥票分时段', '山上山下温差大', '雨后云海看运气'], lang: ['「么子」= 什么', '「灵醒」= 干净漂亮'], photo: ['阿凡达悬浮山 · 雾后', '天门山 999 阶', '金鞭溪 · 逆光'] },
  '东京': { food: ['筑地海鲜丼 · 早去', '一兰拉面 · 自助点单', '居酒屋宵夜'], tips: ['Suica 卡交通万能', '现金店多备日元', '垃圾桶极少自备袋'], lang: ['「すみません」万能开场', '「大丈夫」= 没问题'], photo: ['涩谷十字路口 · 夜', '浅草寺 · 清晨无人', '富士山同框 · 河口湖'] },
  '曼谷': { food: ['冬阴功 · 船面', '芒果糯米饭', 'Pad Thai'], tips: ['大皇宫 15:30 停止入园', 'BTS 避堵', '寺庙过膝着装'], lang: ['「萨瓦迪卡」= 你好（女）', '「扣昆卡」= 谢谢'], photo: ['郑王庙日落', '水上市场 · 清晨', '天台酒吧夜景'] },
  '新加坡': { food: ['海南鸡饭 · 文华酒店旁', '辣椒螃蟹', '肉骨茶'], tips: ['地铁 ez-link 方便', '罚款多守规矩', '室内冷气猛备薄外套'], lang: ['「 Lah 」语气词', '「Can can」= 可以'], photo: ['滨海湾灯光秀 · 20:00', '鱼尾狮经典机位', '甘榜格南彩色墙'] }
}
const GUIDE_CATS = [
  { key: 'food', name: '美食', icon: 'food', color: '#FFC414', bg: '#FFF6D9' },
  { key: 'tips', name: '贴士', icon: 'compass', color: '#2E92ED', bg: '#E3F0FD' },
  { key: 'lang', name: '语言', icon: 'chat', color: '#2BB8A8', bg: '#E0F4F4' },
  { key: 'photo', name: '拍摄', icon: 'camera', color: '#7B8CFF', bg: '#F1EAFE' }
]

function guide(city) {
  const c = GUIDE_LIBRARY[city] || GUIDE_LIBRARY['伊春']
  return GUIDE_CATS.map(cat => ({ ...cat, items: c[cat.key] || [] }))
}

function guideCities() { return Object.keys(GUIDE_LIBRARY) }

// ============ AI 行程助手：攻略解析 / 参数生成（规则引擎降级） ============
function parseGuide(text) {
  const lines = (text || '').split(/\n+/).map(s => s.trim()).filter(Boolean)
  const days = []
  let cur = null
  const dayRe = /^(D\s*\d+|Day\s*\d+|第\s*[一二三四五六七八九十0-9]+\s*天)/i
  lines.forEach(line => {
    const clean = line.replace(/^[-•·\d.、\s]+/, '').slice(0, 24)
    if (!clean) return
    if (dayRe.test(line)) {
      const rest = line.replace(dayRe, '').replace(/^[\s:：.、-]+/, '').trim()
      cur = { title: rest.slice(0, 16) || ('Day ' + (days.length + 1)), stops: [] }
      days.push(cur)
      if (rest) cur.stops.push({ name: rest.split(/[，,（(]/)[0].slice(0, 14) })
    } else if (cur) {
      if (cur.stops.length < 8) cur.stops.push({ name: clean.split(/[，,（(]/)[0].slice(0, 14) })
    } else {
      cur = { title: 'Day ' + (days.length + 1), stops: [{ name: clean.split(/[，,（(]/)[0].slice(0, 14) }] }
      days.push(cur)
    }
  })
  const valid = days.filter(d => d.stops.length)
  return { source: 'rule-engine', days: valid.slice(0, 7) }
}

function generateItinerary(dest, nDays, pace, prefs) {
  const perDay = pace === '紧凑' ? 4 : pace === '松弛' ? 2 : 3
  const prefPool = {
    '摄影': ['日出机位', '黄昏观景台', '老街人文扫街'],
    '美食': ['本地菜市场', '名店老号一条街', '夜市收官'],
    '亲子': ['动物园 / 水族馆', '科技馆 / 博物馆', '城市公园野餐'],
    '徒步': ['环线步道半日', '森林公园吸氧', '江边 / 海岸线慢走']
  }
  const base = [dest + '经典地标', dest + '老城漫步', dest + '博物馆半日', dest + '特色街区']
  const prefStops = (prefs || []).flatMap(p => prefPool[p] || [])
  const days = []
  let k = 0
  for (let i = 0; i < nDays; i++) {
    const stops = []
    for (let j = 0; j < perDay; j++) {
      const s = i * perDay + j
      stops.push(s < prefStops.length ? prefStops[s] : base[k++ % base.length])
    }
    days.push({ title: 'D' + (i + 1) + ' · ' + dest, stops: stops.map(name => ({ name })) })
  }
  const perPerson = 600 * nDays + (prefs || []).length * 150
  return { source: 'rule-engine', days, perPerson, note: AI_CONFIGURED ? '大模型生成' : '内置规则引擎生成（配置大模型后更个性）' }
}

// ============ 使用助手：功能问答（关键词匹配降级） ============
const HELPER_QA = [
  { k: ['记账', 'AA', '垫付', '分摊'], a: '在「行程总览 → 记账」点右下角「记一笔」：选分类 → 填金额 → 选垫付人 → 选分摊方式（平均/按比例/指定人）。所有人记账自动汇总，去「智能结算」可一键生成转账最少的结清方案。' },
  { k: ['邀请', '同伴', '加入'], a: '「行程总览 → 成员条右侧 +」或「我的 → 消息」：支持微信好友分享、朋友圈、复制链接、面对面扫码四种方式，成员进来自动获得日程与记账编辑权。' },
  { k: ['出发模式', '下一站', '勾选'], a: '「行程总览 → 出发模式」是全屏当天视图：按天切换、逐站打勾记录进度，系统自动高亮「下一站」并估算站间距离；路线概览图已缓存，断网也能看。' },
  { k: ['锦囊', '手册', '攻略卡'], a: '「旅行锦囊」按目的地生成美食、贴士、语言、拍摄四类卡片，内置 20+ 城市内容库；点「AI 定制」可由大模型按你的行程重写（未配置时用内置规则），也可添加成员自定义卡片。' },
  { k: ['打包', '清单', '行李'], a: '「打包清单」内置证件/衣物/电子/洗护/药品五类中国出行模板，勾选记进度，每件物品可设数量和备注，支持自定义添加。' },
  { k: ['日志', '手记', '照片'], a: '「旅行日志」按天写图文心情手记：选天数、写文字、传多图（自动压缩出缩略图），写完随时可编辑或删除。' },
  { k: ['收藏', '链接', '小红书', '公众号'], a: '「攻略收藏」粘贴小红书/公众号文章链接并备注标题，列表一键直达（复制链接打开）。配合 AI 助手的「解析攻略」可把文本直接转成结构化行程。' },
  { k: ['飞哪儿', '机票', '低价'], a: '「我的 → 飞哪儿」输入出发地、目的地和日期，按人数精确计价聚合低价组合（早鸟/直飞/中转），并附目的地天气与出行建议。' },
  { k: ['夜间', '深色', '暗', '主题'], a: '「我的 → 设置 → 夜间模式」：可跟随系统（默认）、强制浅色或深色，选择会本地记忆，下次打开仍生效。' },
  { k: ['分享', '长辈', '只读'], a: '「我的 → 设置 → 对外分享」生成只读分享链接，对方只能看不能改，适合发给长辈或不参与规划的同行人；微信里也可直接转发小程序卡片。' },
  { k: ['天气', '下雨', '温度'], a: '「行程总览 → 天气速览」展示行程日期窗口内目的地逐日天气与提示；飞哪儿里也有目的地天气。' },
  { k: ['结算', '转账', '结清'], a: '「智能结算」用最少转账算法把所有人的应收应付压成 2-3 笔转账，支持「标记已转」，全部结清后可导出账单报告。' }
]

function helperAnswer(q) {
  const text = (q || '').trim()
  if (!text) return ''
  let best = null, bestScore = 0
  HELPER_QA.forEach(item => {
    const score = item.k.reduce((n, kw) => n + (text.indexOf(kw) >= 0 ? kw.length : 0), 0)
    if (score > bestScore) { bestScore = score; best = item }
  })
  if (best) return best.a
  return AI_CONFIGURED
    ? '（此处接入大模型回答）'
    : '这个问题我还没学过～可以换个问法，或到「行程总览」逐个功能试用：日程、地图、记账、清单、锦囊、日志、收藏、飞哪儿都在那里。'
}

module.exports = {
  AI_CONFIGURED,
  haversineKm, legEstimate, settle,
  weather, travelTip, flights,
  guide, guideCities, GUIDE_CATS,
  parseGuide, generateItinerary,
  helperAnswer, HELPER_QA
}
