/** 演示行程种子：客户端写入（行属主=当前用户）。
 * 数据沿用设计稿正典故事线（render-web/w5·w3 稿）：伊春·五花山赏秋，
 * ¥2,844 · 14 笔 · 4 人 · 人均 ¥711 · 预算 ¥4,000 已用 71% · 3 笔转账结算。
 * 空态时由「工作台」引导导入。 */
import { createRow, createRows } from './entities';

/* eslint-disable @typescript-eslint/no-explicit-any */

const day = (offset: number): string => {
  const d = new Date(Date.now() + offset * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

/** 4 人定妆：李娜=绿 王胖=黄 陈晨=珊瑚（我=owner 由调用方昵称传入） */
const PEERS: [string, string][] = [['李娜', '#2FA96E'], ['王胖', '#E0A800'], ['陈晨', '#FF8A5C']];

type Bill = [category: string, title: string, amount: number, dateOff: number, payer: 0 | 1 | 2 | 3, people: number];

/** 14 笔正典账目（分类合计对齐设计稿：住宿 1,204 / 餐饮 730 / 门票 620 / 交通 260 / 其他 30） */
const BILLS: Bill[] = [
  ['住宿', '木兰民宿 · 2 晚', 964, 0, 0, 4],
  ['住宿', '温泉旅馆 · 1 晚', 240, 2, 3, 4],
  ['餐饮', '午餐 · 铁锅炖', 132, 1, 1, 3],
  ['餐饮', '晚餐 · 林都烤肉', 238, 0, 1, 4],
  ['餐饮', '早餐 · 木兰民宿', 80, 0, 0, 4],
  ['餐饮', '奶茶 ×2', 36, 1, 1, 4],
  ['餐饮', '烧烤夜宵', 56, 1, 1, 4],
  ['餐饮', '山珍野味锅', 188, 1, 0, 4],
  ['门票', '五营国家森林公园 ×4', 240, 1, 0, 4],
  ['门票', '汤旺河林海奇石 ×4', 260, 1, 1, 4],
  ['门票', '红松林空中廊道 ×4', 120, 0, 2, 4],
  ['交通', '加油 · 接站往返', 260, 0, 2, 4],
  ['其他', '停车费', 24, 2, 0, 4],
  ['其他', '明信片邮资', 6, 2, 3, 4],
];

export async function seedDemoTrip(ownerName: string): Promise<string> {
  const start = day(-8);
  const end = day(-5);
  const trip = await createRow('gt_trips', {
    title: '伊春 · 五花山赏秋',
    destination: '黑龙江 · 伊春',
    description: '红松林早光、五花山秋色与界江落日——一趟把秋天看满的旅程。',
    start_date: start,
    end_date: end,
    cover_emoji: '🍁',
    cover_color: '#2E92ED',
    cover_image: null,
    budget: 4000,
    visibility: 'private',
    share_token: null,
  });
  const tripId = (trip as any).id as string;
  const owner = await createRow('gt_trip_members', {
    trip_id: tripId, role: 'owner', display_name: ownerName, avatar_color: '#2E92ED',
  });
  const memberId = (owner as any).id as string;
  const memberIds = [memberId];
  for (const [name, color] of PEERS) {
    const m = await createRow('gt_trip_members', {
      trip_id: tripId, role: 'editor', display_name: name, avatar_color: color,
    });
    memberIds.push((m as any).id as string);
  }

  // 4 天（D1~D4）
  const dayTitles = ['抵达 · 红松林初见', '五营 · 五花山主线', '汤旺河 · 界江秋色', '温泉 · 返程'];
  const dayPlaces = ['伊春市区', '五营国家森林公园', '汤旺河区', '伊春市区'];
  const dayIds = await createRows('gt_days', Array.from({ length: 4 }, (_, i) => ({
    trip_id: tripId, day_number: i + 1, date: day(-8 + i), title: dayTitles[i], place: dayPlaces[i],
  })));

  // D2 时间线（对齐设计稿 w3）
  const plan: [number, string, string, string, string, number, string][] = [
    [0, '15:30', 'transport', '伊春林都机场接站', '机场 → 市区', 0, '包车提前联系好师傅'],
    [0, '18:30', 'food', '晚餐 · 林都烤肉', '伊春区 · 林都大街', 238, '王胖推荐的本地老店'],
    [0, '20:00', 'hotel', '入住 · 木兰民宿', '伊春市区', 0, '两晚连住不用搬行李'],
    [1, '08:30', 'food', '早餐 · 木兰民宿', '民宿一楼', 0, '粥+黏豆包'],
    [1, '09:30', 'sight', '五营国家森林公园', '五营区 · 红松林', 240, '红松林早光线最好，带三脚架'],
    [1, '13:00', 'food', '午餐 · 铁锅炖', '景区门口 · 王胖推荐', 132, '人均 ¥55，排骨焖卷子'],
    [1, '15:00', 'sight', '汤旺河林海奇石', '汤旺河区', 260, '地质奇观 3h，穿防滑鞋'],
    [1, '19:00', 'food', '晚餐 · 山珍野味 + 入住', '汤旺河区', 188, '写手帐的晚上'],
    [2, '09:00', 'sight', '红松林空中廊道', '五营 · 空中栈道', 120, '俯拍五花山全景'],
    [2, '14:00', 'sight', '温泉旅馆', '带岭区', 240, '泡汤解乏'],
    [2, '17:00', 'food', '购物 · 山货伴手礼', '带岭集市', 180, '蓝莓干、木耳、松子'],
    [3, '09:30', 'sight', '界江落日观景台', '嘉荫方向', 0, '返程前最后一眼秋色'],
  ];
  const acts = plan.map(([di, time, kind, title, place, cost, notes], i) => ({
    trip_id: tripId,
    day_id: dayIds[di] || '',
    sort: plan.slice(0, i).filter(([d]) => d === di).length,
    time, end_time: null, kind, title, place, lat: null, lng: null, cost, notes, status: '已确认', assignee_member_id: null,
  }));
  await createRows('gt_activities', acts.filter(a => a.day_id));

  // 14 笔正典账目
  const expenseRows = BILLS.map(([category, title, amount, dateOff, payerIdx, people]) => ({
    trip_id: tripId,
    payer_member_id: memberIds[payerIdx],
    amount,
    category,
    title,
    date: day(-8 + dateOff),
    split_mode: 'equal',
    participants: JSON.stringify(memberIds.slice(0, people)),
  }));
  await createRows('gt_expenses', expenseRows);

  await createRows('gt_packing_items', [
    { trip_id: tripId, category: '证件', title: '身份证', done: true, assignee_member_id: null, quantity: 1, note: '' },
    { trip_id: tripId, category: '衣物', title: '抓绒外套（早晚 5°C）', done: true, assignee_member_id: null, quantity: 1, note: '' },
    { trip_id: tripId, category: '衣物', title: '防晒帽', done: false, assignee_member_id: null, quantity: 1, note: '' },
    { trip_id: tripId, category: '电子', title: '相机 + 三脚架', done: true, assignee_member_id: memberIds[3], note: '红松林早光用' },
    { trip_id: tripId, category: '电子', title: '车载充电器', done: false, assignee_member_id: memberIds[2], note: '' },
    { trip_id: tripId, category: '其他', title: '保温壶', done: false, assignee_member_id: null, quantity: 1, note: '防贼风' },
  ]);

  await createRows('gt_journal_notes', [
    { trip_id: tripId, day_id: dayIds[1] || '', author_member_id: memberId, mood: '🍁', content: '五营的早晨值回全程——阳光斜进红松林的那十分钟，所有人都安静了。铁锅炖排了 40 分钟，值。', images: '[]', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
    { trip_id: tripId, day_id: dayIds[2] || '', author_member_id: memberIds[1], mood: '⛰️', content: '汤旺河的石头像是从地里长出来的。晚上泡了温泉，王胖说这是他今年最舒服的一天。', images: '[]', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  ]);

  await createRows('gt_travel_links', [
    { trip_id: tripId, type: '攻略', title: '伊春五花山四日赏秋攻略', url: 'https://example.com/wuhuashan', note: '红松林早机位+汤旺河路线', created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
    { trip_id: tripId, type: '门票', title: '五营国家森林公园预约', url: 'https://example.com/wuying', note: '¥60/人 · 提前一天', created_at: new Date(Date.now() - 18 * 86400000).toISOString() },
  ]);

  return tripId;
}
