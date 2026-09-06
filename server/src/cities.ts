/** 内置中国主要城市与热门景点数据（GCJ-02 坐标，近似值），供离线搜索与 AI 生成行程兜底 */
export interface BuiltinPoi {
  name: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
  kind: string;
  desc: string;
}

export interface BuiltinCity {
  name: string;
  province: string;
  lat: number;
  lng: number;
  aliases?: string[];
  abroad?: boolean;
}

export const CITIES: BuiltinCity[] = [
  { name: '北京', province: '北京市', lat: 39.904, lng: 116.407 },
  { name: '上海', province: '上海市', lat: 31.23, lng: 121.474 },
  { name: '广州', province: '广东省', lat: 23.129, lng: 113.264 },
  { name: '深圳', province: '广东省', lat: 22.543, lng: 114.058 },
  { name: '成都', province: '四川省', lat: 30.573, lng: 104.067 },
  { name: '重庆', province: '重庆市', lat: 29.563, lng: 106.551 },
  { name: '杭州', province: '浙江省', lat: 30.274, lng: 120.155 },
  { name: '西安', province: '陕西省', lat: 34.342, lng: 108.941 },
  { name: '南京', province: '江苏省', lat: 32.06, lng: 118.797 },
  { name: '苏州', province: '江苏省', lat: 31.299, lng: 120.585 },
  { name: '厦门', province: '福建省', lat: 24.48, lng: 118.089 },
  { name: '青岛', province: '山东省', lat: 36.067, lng: 120.383 },
  { name: '长沙', province: '湖南省', lat: 28.228, lng: 112.939 },
  { name: '武汉', province: '湖北省', lat: 30.593, lng: 114.305 },
  { name: '昆明', province: '云南省', lat: 24.88, lng: 102.833 },
  { name: '大理', province: '云南省', lat: 25.693, lng: 100.164 },
  { name: '丽江', province: '云南省', lat: 26.898, lng: 100.199 },
  { name: '香格里拉', province: '云南省', lat: 27.825, lng: 99.706 },
  { name: '西双版纳', province: '云南省', lat: 22.002, lng: 100.797, aliases: ['景洪'] },
  { name: '三亚', province: '海南省', lat: 18.253, lng: 109.512 },
  { name: '海口', province: '海南省', lat: 20.044, lng: 110.199 },
  { name: '哈尔滨', province: '黑龙江省', lat: 45.803, lng: 126.535 },
  { name: '长春', province: '吉林省', lat: 43.817, lng: 125.324 },
  { name: '沈阳', province: '辽宁省', lat: 41.806, lng: 123.432 },
  { name: '大连', province: '辽宁省', lat: 38.914, lng: 121.615 },
  { name: '乌鲁木齐', province: '新疆', lat: 43.826, lng: 87.617 },
  { name: '喀纳斯', province: '新疆', lat: 48.717, lng: 87.017 },
  { name: '伊犁', province: '新疆', lat: 43.922, lng: 81.324, aliases: ['那拉提', '赛里木湖'] },
  { name: '拉萨', province: '西藏', lat: 29.652, lng: 91.172 },
  { name: '林芝', province: '西藏', lat: 29.649, lng: 94.362 },
  { name: '敦煌', province: '甘肃省', lat: 40.142, lng: 94.662 },
  { name: '兰州', province: '甘肃省', lat: 36.061, lng: 103.834 },
  { name: '西宁', province: '青海省', lat: 36.617, lng: 101.778 },
  { name: '青海湖', province: '青海省', lat: 36.88, lng: 100.38 },
  { name: '桂林', province: '广西', lat: 25.274, lng: 110.29 },
  { name: '阳朔', province: '广西', lat: 24.774, lng: 110.489 },
  { name: '北海', province: '广西', lat: 21.481, lng: 109.12 },
  { name: '贵阳', province: '贵州省', lat: 26.647, lng: 106.63 },
  { name: '遵义', province: '贵州省', lat: 27.726, lng: 106.927 },
  { name: '张家界', province: '湖南省', lat: 29.117, lng: 110.479 },
  { name: '凤凰古城', province: '湖南省', lat: 27.95, lng: 109.599 },
  { name: '洛阳', province: '河南省', lat: 34.62, lng: 112.454 },
  { name: '开封', province: '河南省', lat: 34.797, lng: 114.308 },
  { name: '郑州', province: '河南省', lat: 34.747, lng: 113.625 },
  { name: '太原', province: '山西省', lat: 37.87, lng: 112.549 },
  { name: '平遥', province: '山西省', lat: 37.189, lng: 112.176, aliases: ['平遥古城'] },
  { name: '大同', province: '山西省', lat: 40.076, lng: 113.3 },
  { name: '呼和浩特', province: '内蒙古', lat: 40.842, lng: 111.75 },
  { name: '呼伦贝尔', province: '内蒙古', lat: 49.212, lng: 119.766 },
  { name: '银川', province: '宁夏', lat: 38.487, lng: 106.231 },
  { name: '天津', province: '天津市', lat: 39.343, lng: 117.362 },
  { name: '济南', province: '山东省', lat: 36.651, lng: 117.12 },
  { name: '泰安', province: '山东省', lat: 36.2, lng: 117.087, aliases: ['泰山'] },
  { name: '烟台', province: '山东省', lat: 37.463, lng: 121.448 },
  { name: '合肥', province: '安徽省', lat: 31.821, lng: 117.227 },
  { name: '黄山', province: '安徽省', lat: 30.076, lng: 118.17 },
  { name: '南昌', province: '江西省', lat: 28.684, lng: 115.858 },
  { name: '景德镇', province: '江西省', lat: 29.269, lng: 117.18 },
  { name: '福州', province: '福建省', lat: 26.074, lng: 119.297 },
  { name: '泉州', province: '福建省', lat: 24.874, lng: 118.676 },
  { name: '南宁', province: '广西', lat: 22.817, lng: 108.366 },
  { name: '宁波', province: '浙江省', lat: 29.868, lng: 121.544 },
  { name: '温州', province: '浙江省', lat: 27.994, lng: 120.699 },
  { name: '绍兴', province: '浙江省', lat: 30.03, lng: 120.581 },
  { name: '嘉兴', province: '浙江省', lat: 30.746, lng: 120.755, aliases: ['乌镇', '西塘'] },
  { name: '莫干山', province: '浙江省', lat: 30.602, lng: 119.863 },
  { name: '无锡', province: '江苏省', lat: 31.491, lng: 120.312 },
  { name: '扬州', province: '江苏省', lat: 32.395, lng: 119.421 },
  { name: '镇江', province: '江苏省', lat: 32.188, lng: 119.421 },
  { name: '香港', province: '港澳', lat: 22.32, lng: 114.169 },
  { name: '澳门', province: '港澳', lat: 22.199, lng: 113.544 },
  // 国际热门目的地（城市级坐标，用于地图与天气定位）
  { name: '东京', province: '日本', lat: 35.676, lng: 139.65, abroad: true },
  { name: '大阪', province: '日本', lat: 34.694, lng: 135.502, abroad: true },
  { name: '京都', province: '日本', lat: 35.012, lng: 135.768, abroad: true },
  { name: '首尔', province: '韩国', lat: 37.567, lng: 126.978, abroad: true },
  { name: '曼谷', province: '泰国', lat: 13.756, lng: 100.502, abroad: true },
  { name: '清迈', province: '泰国', lat: 18.788, lng: 98.985, abroad: true },
  { name: '普吉岛', province: '泰国', lat: 7.881, lng: 98.392, abroad: true },
  { name: '新加坡', province: '新加坡', lat: 1.352, lng: 103.82, abroad: true },
  { name: '吉隆坡', province: '马来西亚', lat: 3.139, lng: 101.687, abroad: true },
  { name: '仙本那', province: '马来西亚', lat: 4.478, lng: 118.612, abroad: true },
  { name: '巴厘岛', province: '印度尼西亚', lat: -8.409, lng: 115.189, abroad: true },
  { name: '芽庄', province: '越南', lat: 12.239, lng: 109.196, abroad: true },
  { name: '岘港', province: '越南', lat: 16.054, lng: 108.202, abroad: true },
  { name: '长滩岛', province: '菲律宾', lat: 11.967, lng: 121.925, abroad: true },
  { name: '巴黎', province: '法国', lat: 48.857, lng: 2.352, abroad: true },
  { name: '伦敦', province: '英国', lat: 51.507, lng: -0.128, abroad: true },
  { name: '罗马', province: '意大利', lat: 41.903, lng: 12.496, abroad: true },
  { name: '苏黎世', province: '瑞士', lat: 47.377, lng: 8.54, abroad: true },
  { name: '悉尼', province: '澳大利亚', lat: -33.868, lng: 151.209, abroad: true },
  { name: '墨尔本', province: '澳大利亚', lat: -37.814, lng: 144.963, abroad: true },
  { name: '奥克兰', province: '新西兰', lat: -36.849, lng: 174.763, abroad: true },
  { name: '纽约', province: '美国', lat: 40.713, lng: -74.006, abroad: true },
  { name: '洛杉矶', province: '美国', lat: 34.052, lng: -118.244, abroad: true },
  { name: '迪拜', province: '阿联酋', lat: 25.205, lng: 55.271, abroad: true },
  { name: '莫斯科', province: '俄罗斯', lat: 55.756, lng: 37.617, abroad: true },
];

export const POIS: BuiltinPoi[] = [
  // 北京
  { name: '故宫博物院', city: '北京', province: '北京市', lat: 39.916, lng: 116.397, kind: '景点', desc: '世界现存最大木结构宫殿群，需提前预约' },
  { name: '天安门广场', city: '北京', province: '北京市', lat: 39.904, lng: 116.397, kind: '景点', desc: '看升旗要赶早' },
  { name: '八达岭长城', city: '北京', province: '北京市', lat: 40.359, lng: 116.007, kind: '景点', desc: '不到长城非好汉' },
  { name: '颐和园', city: '北京', province: '北京市', lat: 39.999, lng: 116.275, kind: '景点', desc: '皇家园林，昆明湖泛舟' },
  { name: '天坛公园', city: '北京', province: '北京市', lat: 39.882, lng: 116.407, kind: '景点', desc: '祈年殿早间人少' },
  { name: '南锣鼓巷', city: '北京', province: '北京市', lat: 39.933, lng: 116.403, kind: '街区', desc: '胡同小吃一条街' },
  { name: '环球影城', city: '北京', province: '北京市', lat: 39.778, lng: 116.719, kind: '乐园', desc: '哈利波特园区必打卡' },
  { name: '全聚德烤鸭店', city: '北京', province: '北京市', lat: 39.899, lng: 116.4, kind: '美食', desc: '挂炉烤鸭老字号' },
  // 上海
  { name: '外滩', city: '上海', province: '上海市', lat: 31.24, lng: 121.49, kind: '景点', desc: '夜景一流，对岸陆家嘴三件套' },
  { name: '东方明珠', city: '上海', province: '上海市', lat: 31.24, lng: 121.5, kind: '景点', desc: '城市地标' },
  { name: '豫园', city: '上海', province: '上海市', lat: 31.227, lng: 121.492, kind: '景点', desc: '江南园林，城隍庙小吃' },
  { name: '迪士尼乐园', city: '上海', province: '上海市', lat: 31.144, lng: 121.657, kind: '乐园', desc: '记得提前买早享卡' },
  { name: '武康路', city: '上海', province: '上海市', lat: 31.207, lng: 121.437, kind: '街区', desc: '梧桐区 Citywalk 路线' },
  { name: '田子坊', city: '上海', province: '上海市', lat: 31.21, lng: 121.466, kind: '街区', desc: '弄堂文创小店' },
  // 成都
  { name: '大熊猫繁育研究基地', city: '成都', province: '四川省', lat: 30.733, lng: 104.144, kind: '景点', desc: '早上熊猫最活跃' },
  { name: '宽窄巷子', city: '成都', province: '四川省', lat: 30.663, lng: 104.052, kind: '街区', desc: '老成都生活切片' },
  { name: '锦里', city: '成都', province: '四川省', lat: 30.645, lng: 104.048, kind: '街区', desc: '夜景漂亮，小吃多' },
  { name: '武侯祠', city: '成都', province: '四川省', lat: 30.644, lng: 104.048, kind: '景点', desc: '三国迷必去' },
  { name: '都江堰', city: '成都', province: '四川省', lat: 31.0, lng: 103.647, kind: '景点', desc: '千年水利工程' },
  { name: '青城山', city: '成都', province: '四川省', lat: 30.9, lng: 103.568, kind: '景点', desc: '青城天下幽' },
  { name: '人民公园鹤鸣茶社', city: '成都', province: '四川省', lat: 30.661, lng: 104.055, kind: '休闲', desc: '盖碗茶 + 采耳' },
  // 重庆
  { name: '洪崖洞', city: '重庆', province: '重庆市', lat: 29.563, lng: 106.578, kind: '景点', desc: '千与千寻同款夜景' },
  { name: '磁器口古镇', city: '重庆', province: '重庆市', lat: 29.578, lng: 106.45, kind: '街区', desc: '陈麻花、毛血旺' },
  { name: '长江索道', city: '重庆', province: '重庆市', lat: 29.557, lng: 106.583, kind: '体验', desc: '空中横渡长江' },
  { name: '李子坝轻轨站', city: '重庆', province: '重庆市', lat: 29.563, lng: 106.542, kind: '打卡', desc: '轻轨穿楼观景台' },
  { name: '武隆天生三桥', city: '重庆', province: '重庆市', lat: 29.361, lng: 107.757, kind: '景点', desc: '喀斯特天坑，一日游往返' },
  // 杭州
  { name: '西湖', city: '杭州', province: '浙江省', lat: 30.243, lng: 120.153, kind: '景点', desc: '断桥、苏堤、雷峰塔环线' },
  { name: '灵隐寺', city: '杭州', province: '浙江省', lat: 30.247, lng: 120.101, kind: '景点', desc: '飞来峰造像' },
  { name: '西溪湿地', city: '杭州', province: '浙江省', lat: 30.273, lng: 120.063, kind: '景点', desc: '摇橹船进湿地' },
  { name: '河坊街', city: '杭州', province: '浙江省', lat: 30.242, lng: 120.166, kind: '街区', desc: '定胜糕、龙井' },
  { name: '龙井村', city: '杭州', province: '浙江省', lat: 30.216, lng: 120.11, kind: '休闲', desc: '茶园徒步' },
  // 西安
  { name: '秦始皇兵马俑', city: '西安', province: '陕西省', lat: 34.384, lng: 109.278, kind: '景点', desc: '世界第八大奇迹' },
  { name: '西安城墙', city: '西安', province: '陕西省', lat: 34.252, lng: 108.949, kind: '景点', desc: '租自行车环城墙' },
  { name: '大唐不夜城', city: '西安', province: '陕西省', lat: 34.22, lng: 108.964, kind: '街区', desc: '夜景灯光秀，不倒翁小姐姐' },
  { name: '回民街', city: '西安', province: '陕西省', lat: 34.262, lng: 108.94, kind: '美食', desc: '羊肉泡馍、镜糕' },
  { name: '陕西历史博物馆', city: '西安', province: '陕西省', lat: 34.224, lng: 108.953, kind: '景点', desc: '免费票需抢约' },
  { name: '华山', city: '西安', province: '陕西省', lat: 34.475, lng: 110.085, kind: '景点', desc: '西峰索道上下，一日可往返' },
  // 南京
  { name: '中山陵', city: '南京', province: '江苏省', lat: 32.06, lng: 118.846, kind: '景点', desc: '392 级台阶' },
  { name: '夫子庙 · 秦淮河', city: '南京', province: '江苏省', lat: 32.021, lng: 118.788, kind: '街区', desc: '夜游秦淮画舫' },
  { name: '总统府', city: '南京', province: '江苏省', lat: 32.047, lng: 118.795, kind: '景点', desc: '近代史博物馆' },
  { name: '南京博物院', city: '南京', province: '江苏省', lat: 32.047, lng: 118.829, kind: '景点', desc: '民国馆值得一逛' },
  // 苏州
  { name: '拙政园', city: '苏州', province: '江苏省', lat: 31.325, lng: 120.63, kind: '景点', desc: '江南园林之首' },
  { name: '平江路', city: '苏州', province: '江苏省', lat: 31.32, lng: 120.633, kind: '街区', desc: '小桥流水人家' },
  { name: '虎丘', city: '苏州', province: '江苏省', lat: 31.328, lng: 120.573, kind: '景点', desc: '吴中第一名胜' },
  { name: '金鸡湖', city: '苏州', province: '江苏省', lat: 31.296, lng: 120.687, kind: '休闲', desc: '摩天轮夜景' },
  // 厦门
  { name: '鼓浪屿', city: '厦门', province: '福建省', lat: 24.445, lng: 118.067, kind: '景点', desc: '轮渡上岛，万国建筑' },
  { name: '曾厝垵', city: '厦门', province: '福建省', lat: 24.437, lng: 118.112, kind: '街区', desc: '文艺渔村小吃' },
  { name: '环岛路', city: '厦门', province: '福建省', lat: 24.44, lng: 118.13, kind: '休闲', desc: '海边骑行' },
  { name: '南普陀寺', city: '厦门', province: '福建省', lat: 24.441, lng: 118.09, kind: '景点', desc: '紧邻厦大，素饼出名' },
  // 青岛
  { name: '栈桥', city: '青岛', province: '山东省', lat: 36.059, lng: 120.319, kind: '景点', desc: '海鸥冬季最多' },
  { name: '八大关', city: '青岛', province: '山东省', lat: 36.053, lng: 120.354, kind: '街区', desc: '万国建筑博览会' },
  { name: '崂山', city: '青岛', province: '山东省', lat: 36.157, lng: 120.624, kind: '景点', desc: '海上名山第一' },
  { name: '台东夜市', city: '青岛', province: '山东省', lat: 36.077, lng: 120.372, kind: '美食', desc: '烤鱿鱼、野馄饨' },
  // 长沙
  { name: '橘子洲头', city: '长沙', province: '湖南省', lat: 28.19, lng: 112.962, kind: '景点', desc: '青年毛泽东雕像' },
  { name: '岳麓山', city: '长沙', province: '湖南省', lat: 28.185, lng: 112.935, kind: '景点', desc: '爱晚亭秋色' },
  { name: '五一广场 · 黄兴路', city: '长沙', province: '湖南省', lat: 28.196, lng: 112.977, kind: '美食', desc: '茶颜悦色、文和友' },
  // 武汉
  { name: '黄鹤楼', city: '武汉', province: '湖北省', lat: 30.545, lng: 114.301, kind: '景点', desc: '天下江山第一楼' },
  { name: '东湖绿道', city: '武汉', province: '湖北省', lat: 30.55, lng: 114.42, kind: '休闲', desc: '骑行环湖' },
  { name: '户部巷', city: '武汉', province: '湖北省', lat: 30.543, lng: 114.305, kind: '美食', desc: '热干面、豆皮' },
  { name: '湖北省博物馆', city: '武汉', province: '湖北省', lat: 30.565, lng: 114.367, kind: '景点', desc: '越王勾践剑' },
  // 昆明
  { name: '滇池 · 海埂公园', city: '昆明', province: '云南省', lat: 24.955, lng: 102.653, kind: '景点', desc: '冬天喂红嘴鸥' },
  { name: '石林', city: '昆明', province: '云南省', lat: 24.757, lng: 103.33, kind: '景点', desc: '喀斯特石林奇观' },
  { name: '翠湖公园', city: '昆明', province: '云南省', lat: 25.048, lng: 102.707, kind: '休闲', desc: '市中心看鸥' },
  // 大理
  { name: '大理古城', city: '大理', province: '云南省', lat: 25.693, lng: 100.164, kind: '古城', desc: '复兴路、人民路慢慢逛' },
  { name: '洱海', city: '大理', province: '云南省', lat: 25.75, lng: 100.18, kind: '景点', desc: '环海西路骑行最美' },
  { name: '喜洲古镇', city: '大理', province: '云南省', lat: 25.856, lng: 100.121, kind: '古城', desc: '白族建筑 + 喜洲粑粑' },
  { name: '双廊古镇', city: '大理', province: '云南省', lat: 25.93, lng: 100.19, kind: '古城', desc: '海景客栈集中' },
  { name: '苍山', city: '大理', province: '云南省', lat: 25.66, lng: 100.15, kind: '景点', desc: '感通索道 / 洗马潭大索道' },
  { name: '寂照庵', city: '大理', province: '云南省', lat: 25.663, lng: 100.177, kind: '景点', desc: '多肉花园素斋庵堂' },
  { name: '崇圣寺三塔', city: '大理', province: '云南省', lat: 25.714, lng: 100.152, kind: '景点', desc: '大理地标倒影公园' },
  // 丽江
  { name: '丽江古城（大研）', city: '丽江', province: '云南省', lat: 26.898, lng: 100.199, kind: '古城', desc: '四方街、酒吧街' },
  { name: '束河古镇', city: '丽江', province: '云南省', lat: 26.9, lng: 100.194, kind: '古城', desc: '比大研安静' },
  { name: '玉龙雪山', city: '丽江', province: '云南省', lat: 27.117, lng: 100.171, kind: '景点', desc: '大索道提前订，备氧气' },
  { name: '蓝月谷', city: '丽江', province: '云南省', lat: 27.091, lng: 100.191, kind: '景点', desc: '牛奶蓝湖水' },
  { name: '泸沽湖', city: '丽江', province: '云南省', lat: 27.708, lng: 100.788, kind: '景点', desc: '车程 4 小时，建议住一晚' },
  { name: '木府', city: '丽江', province: '云南省', lat: 26.897, lng: 100.197, kind: '景点', desc: '北有故宫，南有木府' },
  // 三亚
  { name: '亚龙湾', city: '三亚', province: '海南省', lat: 18.205, lng: 109.647, kind: '海滩', desc: '沙质最好' },
  { name: '蜈支洲岛', city: '三亚', province: '海南省', lat: 18.313, lng: 109.763, kind: '海岛', desc: '潜水、环岛电瓶车' },
  { name: '天涯海角', city: '三亚', province: '海南省', lat: 18.297, lng: 109.345, kind: '景点', desc: '打卡即走' },
  { name: '后海村', city: '三亚', province: '海南省', lat: 18.311, lng: 109.716, kind: '冲浪', desc: '新手冲浪圣地' },
  // 哈尔滨
  { name: '冰雪大世界', city: '哈尔滨', province: '黑龙江省', lat: 45.784, lng: 126.559, kind: '冰雪', desc: '12 月底开园，傍晚最美' },
  { name: '中央大街', city: '哈尔滨', province: '黑龙江省', lat: 45.773, lng: 126.618, kind: '街区', desc: '马迭尔冰棍、俄式建筑' },
  { name: '圣索菲亚大教堂', city: '哈尔滨', province: '黑龙江省', lat: 45.773, lng: 126.619, kind: '景点', desc: '拜占庭风格地标' },
  // 新疆
  { name: '天山天池', city: '乌鲁木齐', province: '新疆', lat: 43.887, lng: 88.117, kind: '景点', desc: '雪峰湖泊，一日往返' },
  { name: '国际大巴扎', city: '乌鲁木齐', province: '新疆', lat: 43.783, lng: 87.617, kind: '街区', desc: '美食与手工艺' },
  { name: '赛里木湖', city: '伊犁', province: '新疆', lat: 44.58, lng: 81.53, kind: '景点', desc: '大西洋最后一滴眼泪' },
  { name: '那拉提草原', city: '伊犁', province: '新疆', lat: 43.35, lng: 82.13, kind: '景点', desc: '空中草原' },
  { name: '喀纳斯湖', city: '喀纳斯', province: '新疆', lat: 48.72, lng: 87.01, kind: '景点', desc: '秋季金黄白桦林' },
  // 西藏
  { name: '布达拉宫', city: '拉萨', province: '西藏', lat: 29.655, lng: 91.117, kind: '景点', desc: '需提前预约门票' },
  { name: '大昭寺', city: '拉萨', province: '西藏', lat: 29.65, lng: 91.133, kind: '景点', desc: '八廓街转经' },
  { name: '纳木错', city: '拉萨', province: '西藏', lat: 30.708, lng: 90.568, kind: '景点', desc: '圣湖一日游' },
  // 西北环线
  { name: '莫高窟', city: '敦煌', province: '甘肃省', lat: 40.036, lng: 94.809, kind: '景点', desc: 'A 类票提前 15 天抢' },
  { name: '鸣沙山月牙泉', city: '敦煌', province: '甘肃省', lat: 40.097, lng: 94.673, kind: '景点', desc: '日落爬沙山' },
  { name: '茶卡盐湖', city: '西宁', province: '青海省', lat: 36.68, lng: 99.08, kind: '景点', desc: '天空之镜' },
  { name: '青海湖', city: '青海湖', province: '青海省', lat: 36.88, lng: 100.38, kind: '景点', desc: '七月油菜花海' },
  { name: '张掖七彩丹霞', city: '张掖', province: '甘肃省', lat: 38.968, lng: 100.539, kind: '景点', desc: '日落时最红' },
  // 桂林
  { name: '漓江竹筏', city: '桂林', province: '广西', lat: 25.274, lng: 110.29, kind: '景点', desc: '兴坪段 20 元人民币背景' },
  { name: '阳朔西街', city: '阳朔', province: '广西', lat: 24.774, lng: 110.489, kind: '街区', desc: '夜生活集中' },
  { name: '遇龙河漂流', city: '阳朔', province: '广西', lat: 24.75, lng: 110.44, kind: '体验', desc: '人工竹筏慢漂' },
  { name: '龙脊梯田', city: '桂林', province: '广西', lat: 25.73, lng: 110.13, kind: '景点', desc: '金秋最佳' },
  // 贵州
  { name: '黄果树瀑布', city: '安顺', province: '贵州省', lat: 25.98, lng: 105.67, kind: '景点', desc: '水帘洞穿雨衣' },
  { name: '西江千户苗寨', city: '黔东南', province: '贵州省', lat: 26.51, lng: 108.31, kind: '古村', desc: '夜景万家灯火' },
  { name: '荔波小七孔', city: '黔南', province: '贵州省', lat: 25.42, lng: 107.88, kind: '景点', desc: '绿宝石湖水' },
  // 张家界
  { name: '张家界国家森林公园', city: '张家界', province: '湖南省', lat: 29.315, lng: 110.435, kind: '景点', desc: '阿凡达悬浮山' },
  { name: '天门山', city: '张家界', province: '湖南省', lat: 29.048, lng: 110.474, kind: '景点', desc: '玻璃栈道、999 级天梯' },
  { name: '凤凰古城', city: '凤凰古城', province: '湖南省', lat: 27.95, lng: 109.599, kind: '古城', desc: '沱江吊脚楼夜景' },
  // 山西
  { name: '平遥古城', city: '平遥', province: '山西省', lat: 37.189, lng: 112.176, kind: '古城', desc: '票号文化，《又见平遥》演出' },
  { name: '云冈石窟', city: '大同', province: '山西省', lat: 40.112, lng: 113.132, kind: '景点', desc: '北魏皇家石窟' },
  { name: '悬空寺', city: '大同', province: '山西省', lat: 39.66, lng: 113.72, kind: '景点', desc: '恒山峭壁上的古寺' },
  { name: '五台山', city: '忻州', province: '山西省', lat: 39.02, lng: 113.53, kind: '景点', desc: '佛教名山' },
  // 港澳
  { name: '维多利亚港 · 星光大道', city: '香港', province: '港澳', lat: 22.295, lng: 114.17, kind: '景点', desc: '八点幻彩咏香江灯光秀' },
  { name: '太平山顶', city: '香港', province: '港澳', lat: 22.271, lng: 114.153, kind: '景点', desc: '山顶缆车看夜景' },
  { name: '香港迪士尼', city: '香港', province: '港澳', lat: 22.313, lng: 114.043, kind: '乐园', desc: '园区小一天可刷完' },
  { name: '大三巴牌坊', city: '澳门', province: '港澳', lat: 22.198, lng: 113.54, kind: '景点', desc: '手信街一路吃到头' },
  { name: '官也街', city: '澳门', province: '港澳', lat: 22.198, lng: 113.553, kind: '美食', desc: '猪扒包、葡挞' },
];

export function findCity(name: string): BuiltinCity | null {
  const q = (name || '').trim();
  if (!q) return null;
  for (const c of CITIES) {
    if (c.name === q) return c;
  }
  for (const c of CITIES) {
    if (q.includes(c.name) || c.name.includes(q) || (c.aliases || []).some(a => q.includes(a))) return c;
  }
  return null;
}

/** 在内置数据中搜索 POI */
export function searchBuiltinPois(query: string, city: string): BuiltinPoi[] {
  const q = (query || '').trim();
  const c = (city || '').trim();
  let pool = POIS;
  if (c) {
    const matched = pool.filter(p => p.city.includes(c) || c.includes(p.city));
    if (matched.length) pool = matched;
  }
  if (!q) return pool.slice(0, 20);
  return pool
    .filter(p => p.name.includes(q) || p.city.includes(q) || p.desc.includes(q) || p.kind.includes(q))
    .slice(0, 20);
}
