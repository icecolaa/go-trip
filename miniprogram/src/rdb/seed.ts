/** 演示行程种子：客户端写入（保证 _openid 归属正确，管理端写的行用户看不到）。
 * 内容＝「国庆伊春深度游 · 小兴安岭七日」（用户指定的演示行程），含占位同伴/支出/清单/动态。
 * 空态时由「我的旅程」页引导导入。 */
import { createRow, createRows } from './entities';
import { ensureProfile } from './trip';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 2026 国庆档固定日期：2026-10-01 ~ 10-07 */
const DAY = (n: number): string => `2026-10-${String(n).padStart(2, '0')}`;

export async function seedDemoTrip(ownerName: string): Promise<string> {
  const me = await ensureProfile();
  const trip = await createRow('gt_trips', {
    title: '国庆伊春深度游',
    destination: '小兴安岭 · 伊春',
    description: '小兴安岭七日 · 红松林与界江秋色。G331 边防公路、五花山、金山鹿苑，一场秋天的深度漫游。',
    start_date: DAY(1),
    end_date: DAY(7),
    cover_emoji: '🌲',
    cover_color: '#2f6e4f',
    cover_image: null,
    budget: 8000,
    visibility: 'private',
    share_token: (me as any).owner || '',
  });
  const tripId = (trip as any).id as string;

  // 占位同伴（设计稿故事线 4 人）：owner + 李娜/王胖/陈晨
  const members = await createRows('gt_trip_members', [
    { trip_id: tripId, role: 'owner', display_name: me.nickname || ownerName, avatar_color: '#2E92ED' },
    { trip_id: tripId, role: 'editor', display_name: '李娜', avatar_color: '#FFC414' },
    { trip_id: tripId, role: 'editor', display_name: '王胖', avatar_color: '#2FA96E' },
    { trip_id: tripId, role: 'editor', display_name: '陈晨', avatar_color: '#FF8A5C' },
  ]);
  const memberId = members[0];

  // 7 天（对应手绘路线图 10.1–10.7）
  const dayMeta: [string, string][] = [
    ['抵达伊春 · 林都夜色', '伊春市区'],
    ['上甘岭溪水 · 五营红松林', '上甘岭 → 五营'],
    ['汤旺河奇石 · 乌伊岭松江源', '汤旺河 → 乌伊岭'],
    ['茅兰沟 · 恐龙界碑', '嘉荫'],
    ['G331边防公路 · 龙江三峡', '萝北'],
    ['金山鹿苑 · 枫林S湾', '金山屯 → 伊春'],
    ['返程', '伊春 → 北京'],
  ];
  const dayIds = await createRows('gt_days', dayMeta.map(([title, place], i) => ({
    trip_id: tripId, day_number: i + 1, date: DAY(i + 1), title, place,
  })));

  // 活动：[天序号(0起), 时间, 分类, 标题, 地点, 费用, 备注]
  const plan: [number, string, string, string, string, number, string][] = [
    [0, '12:40', 'transport', '北京飞伊春 · 林都机场集合', '伊春林都机场', 0, '集合后统一前往酒店'],
    [0, '15:00', 'sight', '兴安国家森林公园', '伊春区', 0, '轻徒步·观林都全景'],
    [0, '17:00', 'sight', '林都木雕园', '伊春区', 0, ''],
    [0, '18:30', 'food', '伊春夜市自由觅食', '伊春夜市', 60, '烤冷面、串串、蓝莓汁'],
    [1, '08:30', 'transport', '包车上甘岭溪水国家森林公园', '上甘岭', 0, '车程约 1 小时'],
    [1, '09:30', 'sight', '溪水公园 · 红松林栈道', '上甘岭', 45, '投喂花栗鼠'],
    [1, '14:00', 'sight', '五营国家森林公园 · 少奇号小火车', '五营区', 60, '小火车记得坐左侧'],
    [1, '18:00', 'food', '团餐 · 酒店东北宴', '五营', 88, '满堂红锅肉、库尔滨鳕鱼、杀猪菜'],
    [2, '08:00', 'sight', '汤旺河林海奇石景区', '汤旺河区', 65, '花岗岩石林与封神秋景'],
    [2, '14:00', 'sight', '乌伊岭松江源地 · 湿地木栈道', '乌伊岭', 40, ''],
    [2, '18:00', 'food', '团餐 · 中俄界江鱼宴', '汤旺河', 96, '清蒸鳌花鱼、小鸡炖蘑菇'],
    [3, '08:00', 'transport', '包车赴嘉荫 · 途中观五花山', '嘉荫方向', 0, 'G331 前段'],
    [3, '10:30', 'sight', '茅兰沟国家森林公园', '嘉荫县', 78, '峡谷栈道约 3 小时'],
    [3, '14:30', 'sight', '恐龙国家地质公园 + 223 中俄界碑', '嘉荫县', 68, '边境游船视天气'],
    [3, '18:00', 'food', '晚餐自由 AA 特色美食', '嘉荫县城', 80, '推荐界江烤鱼'],
    [4, '08:00', 'transport', 'G331 醉美边防公路自驾/包车', '嘉荫 → 萝北', 0, '全天边防公路景观'],
    [4, '11:00', 'sight', '龙江三峡 · 云天阁俯瞰', '萝北县', 50, '俯瞰黑龙江与五花山'],
    [4, '15:00', 'sight', '萝北名山岛', '萝北县', 30, ''],
    [4, '18:00', 'food', '团餐 · 酒店百味宴', '萝北', 88, '红烧鲤鱼、麻辣香锅虾'],
    [5, '09:00', 'sight', '金山鹿苑 · 喂小鹿', '金山屯', 55, '鹿饼 10 元一份'],
    [5, '13:00', 'sight', '金祖峰 · 枫林路网红 S 湾', '金山屯', 0, '公路拍照注意安全'],
    [5, '17:30', 'food', '散团晚餐 · 东北炖菜宴', '伊春区', 92, '锅包肉、全民肘子'],
    [6, '09:30', 'transport', '伊春返程飞北京', '伊春林都机场', 0, '订 12:00 后航班'],
  ];
  const acts = plan.map(([di, time, kind, title, place, cost, notes], i) => ({
    trip_id: tripId,
    day_id: dayIds[di] || '',
    sort: plan.slice(0, i).filter(([d]) => d === di).length,
    time, end_time: null, kind, title, place, lat: null, lng: null, cost, notes, status: '已确认', assignee_member_id: null,
  }));
  await createRows('gt_activities', acts.filter(a => a.day_id));

  // 支出（设计稿故事线：总支出 ¥2,844 · 4 人均摊）
  await createRows('gt_expenses', [
    { trip_id: tripId, payer_member_id: memberId, amount: 964, category: '住宿', title: '酒店 · 六晚', date: DAY(1), split_mode: 'equal', participants: JSON.stringify(members) },
    { trip_id: tripId, payer_member_id: members[1], amount: 1050, category: '交通', title: '全程包车', date: DAY(2), split_mode: 'equal', participants: JSON.stringify(members) },
    { trip_id: tripId, payer_member_id: members[2], amount: 366, category: '门票', title: '各景区门票合计', date: DAY(3), split_mode: 'equal', participants: JSON.stringify(members) },
    { trip_id: tripId, payer_member_id: members[3], amount: 240, category: '餐饮', title: '团餐 · 四顿', date: DAY(4), split_mode: 'equal', participants: JSON.stringify(members) },
    { trip_id: tripId, payer_member_id: memberId, amount: 224, category: '其他', title: '特产与零食', date: DAY(6), split_mode: 'equal', participants: JSON.stringify(members) },
  ]);

  // 清单（秋日小兴安岭版）
  await createRows('gt_packing_items', [
    { trip_id: tripId, category: '证件', title: '身份证', done: true, assignee_member_id: null, quantity: 1, note: '边境地区查验' },
    { trip_id: tripId, category: '衣物', title: '冲锋衣', done: true, assignee_member_id: null, quantity: 1, note: '早晚 5°C' },
    { trip_id: tripId, category: '电子', title: '充电宝', done: false, assignee_member_id: null, quantity: 1, note: '' },
    { trip_id: tripId, category: '药品', title: '驱蚊液', done: false, assignee_member_id: null, quantity: 1, note: '林区必备' },
  ]);

  // 动态流（消息 Tab 演示内容）
  await createRows('gt_activity_log', [
    { trip_id: tripId, member_name: me.nickname || ownerName, avatar_color: '#2E92ED', action: '创建了旅程', detail: '国庆伊春深度游 · 10.1 – 10.7' },
    { trip_id: tripId, member_name: '李娜', avatar_color: '#FFC414', action: '添加了景点', detail: '「汤旺河林海奇石」已加入 D3 行程' },
    { trip_id: tripId, member_name: '王胖', avatar_color: '#2FA96E', action: '记了一笔账', detail: '全程包车 ¥1,050 · 4 人均摊' },
    { trip_id: tripId, member_name: '陈晨', avatar_color: '#FF8A5C', action: '更新了打包清单', detail: '冲锋衣已打包' },
  ]);

  return tripId;
}
