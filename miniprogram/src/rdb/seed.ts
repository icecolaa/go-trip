/** 演示行程种子：客户端写入（保证 _openid 归属正确，管理端写的行用户看不到）。
 * 空态时由「我的旅程」页引导导入。 */
import { createRow, createRows, listRows } from './entities';

/* eslint-disable @typescript-eslint/no-explicit-any */

const day = (offset: number): string => {
  const d = new Date(Date.now() + offset * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export async function seedDemoTrip(ownerName: string): Promise<string> {
  const start = day(10);
  const end = day(12);
  const trip = await createRow('gt_trips', {
    title: '大理丽江 · 3 日慢游',
    destination: '大理',
    description: '演示行程：风花雪月加雪山，节奏放慢一点。',
    start_date: start,
    end_date: end,
    cover_emoji: '🏔️',
    cover_color: '#2f6e4f',
    cover_image: null,
    budget: 3000,
    visibility: 'private',
    share_token: null,
  });
  const tripId = (trip as any).id as string;
  const member = await createRow('gt_trip_members', {
    trip_id: tripId, role: 'owner', display_name: ownerName, avatar_color: '#2f6e4f',
  });
  const memberId = (member as any).id as string;

  const dayTitles = ['', '古城与洱海', '喜洲与双廊', '丽江古城'];
  const dayPlaces = ['大理古城', '大理古城', '双廊', '丽江古城'];
  const dayPlans = Array.from({ length: 3 }, (_, i) => ({
    trip_id: tripId, day_number: i + 1, date: day(10 + i), title: dayTitles[i + 1], place: dayPlaces[i + 1],
  }));
  await createRows('gt_days', dayPlans);
  const dayRows = (await listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }])) as any[];

  const plan: [number, string, string, string, number][] = [
    [0, '09:00', 'sight', '古城漫步：复兴路-五华楼', 0],
    [0, '12:30', 'food', '白族酸辣鱼午餐', 60],
    [0, '15:00', 'sight', '洱海生态廊道骑行', 30],
    [1, '08:30', 'transport', '拼车前往喜洲古镇', 25],
    [1, '10:00', 'sight', '喜洲粑粑+严家大院', 45],
    [1, '14:00', 'sight', '双廊洱海观景台', 0],
    [2, '09:30', 'sight', '丽江古城四方街', 50],
    [2, '14:00', 'sight', '狮子山万古楼俯瞰', 35],
    [2, '18:30', 'food', '腊排骨火锅晚餐', 88],
  ];
  const acts = plan.map(([di, time, kind, title, cost], i) => ({
    trip_id: tripId,
    day_id: dayRows[di]?.id || '',
    sort: plan.slice(0, i).filter(([d]) => d === di).length,
    time, end_time: null, kind, title, place: '', lat: null, lng: null, cost, notes: '', status: '已确认', assignee_member_id: null,
  }));
  await createRows('gt_activities', acts.filter(a => a.day_id));

  await createRows('gt_expenses', [
    { trip_id: tripId, payer_member_id: memberId, amount: 1280, category: '交通', title: '往返高铁', date: start, split_mode: 'equal', participants: JSON.stringify([memberId]) },
    { trip_id: tripId, payer_member_id: memberId, amount: 456, category: '餐饮', title: '全程餐饮预估', date: start, split_mode: 'equal', participants: JSON.stringify([memberId]) },
  ]);
  await createRows('gt_packing_items', [
    { trip_id: tripId, category: '证件', title: '身份证', done: false, assignee_member_id: null, quantity: 1, note: '' },
    { trip_id: tripId, category: '衣物', title: '防晒外套', done: false, assignee_member_id: null, quantity: 1, note: '' },
    { trip_id: tripId, category: '电子', title: '充电宝', done: false, assignee_member_id: null, quantity: 1, note: '' },
  ]);
  return tripId;
}
