/** 行程域数据层：profile、行程列表/聚合、增删改 + 活动日志副作用。 */
import { calcBudget } from '../shared/budget'
import { planDaysSync } from '../shared/sync-days'
import type {
  Activity, Expense, Profile, Trip, TripBundle, TripCardInfo, TripDay, TripMember,
} from '../types'
import { createRow, createRows, deleteRow, deleteRows, getRowById, listRows, updateRow } from './entities'

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOG_COLOR = '#2f6e4f';

function parseJsonField<T>(v: any, fallback: T): T {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

/* ---------------- profile ---------------- */

export async function ensureProfile(): Promise<Profile> {
  const rows = await listRows('gt_users');
  if (rows.length) return rows[0] as unknown as Profile;
  return createRow('gt_users', {
    nickname: '微信用户',
    avatarColor: '#2f6e4f',
    bio: '',
    avatarUrl: null,
  }) as unknown as Profile;
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  await updateRow('gt_users', id, patch);
}

/* ---------------- 行程列表 ---------------- */

export async function listTrips(): Promise<TripCardInfo[]> {
  // 平台限制（2026-09-27 实测）：无过滤条件的 models.list 一律返回空记录，必须带显式 where。
// 锚点 = share_token 字段（模型已登记但业务未使用，挪用存 profile 行的 owner 值——
// 平台自动维护的属主标识 weda_<openid>，跨会话稳定）。devtools 下 list 的行级过滤
// 身份与 create 不一致（模拟器行为），业务锚点可同时绕开两处平台怪癖。真机同逻辑成立。
const meRow = await ensureProfile() as unknown as Profile & { owner?: string };
const anchor = meRow.owner || '';
const trips = (await listRows('gt_trips', anchor ? { share_token: { $eq: anchor } } : {}, [{ createdAt: 'desc' }])) as unknown as Trip[];
  if (!trips.length) return [];
  const out: TripCardInfo[] = [];
  for (const t of trips) {
    const [members, expenses, activities] = await Promise.all([
      listRows('gt_trip_members', { trip_id: { $eq: t.id } }),
      listRows('gt_expenses', { trip_id: { $eq: t.id } }),
      listRows('gt_activities', { trip_id: { $eq: t.id } }),
    ]);
    const mem = members as unknown as TripMember[];
    out.push({
      id: t.id,
      title: t.title,
      destination: t.destination,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      coverEmoji: t.coverEmoji,
      coverColor: t.coverColor,
      budget: t.budget,
      memberPreview: mem.slice(0, 3).map(m => ({ displayName: m.displayName, avatarColor: m.avatarColor })),
      totalSpent: Math.round((expenses as unknown as Expense[]).reduce((s, e) => s + e.amount, 0) * 100) / 100,
      activityCount: activities.length,
    });
  }
  return out;
}

/* ---------------- 行程聚合读 ---------------- */

export async function loadTripBundle(tripId: string): Promise<TripBundle> {
  const trip = await getRowById('gt_trips', tripId);
  if (!trip) throw new Error('行程不存在或无权访问');
  const [members, days, activities, expenses, packing, journal, feed, places, cash, links, guideCards] = await Promise.all([
    listRows('gt_trip_members', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
    listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }]),
    listRows('gt_activities', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]),
    listRows('gt_expenses', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
    listRows('gt_packing_items', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
    listRows('gt_journal_notes', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }]),
    listRows('gt_activity_log', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }], 60),
    listRows('gt_trip_places', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]),
    listRows('gt_trip_cash_items', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
    listRows('gt_travel_links', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }]),
    listRows('gt_guide_cards', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]),
  ]);
  const mem = members as unknown as TripMember[];
  const exp = (expenses as unknown as Expense[]).map(e => ({ ...e, participants: parseJsonField<string[]>(e.participants, []) }));
  const budget = calcBudget(exp, mem);
  return {
    trip: trip as unknown as Trip,
    members: mem,
    days: days as unknown as TripDay[],
    activities: activities as unknown as Activity[],
    expenses: exp,
    budget,
    packing: packing as unknown as TripBundle['packing'],
    journal: (journal as unknown as TripBundle['journal']).map(j => ({ ...j, images: parseJsonField(j.images, []) })),
    feed: feed as unknown as TripBundle['feed'],
    places: places as unknown as TripBundle['places'],
    cash: cash as unknown as TripBundle['cash'],
    links: links as unknown as TripBundle['links'],
    guideCards: (guideCards as unknown as TripBundle['guideCards']).map(c => ({ ...c, items: parseJsonField(c.items, []) })),
  };
}

/* ---------------- 副作用 ---------------- */

export async function logActivity(tripId: string, memberName: string, action: string, detail = ''): Promise<void> {
  await createRow('gt_activity_log', {
    trip_id: tripId,
    member_name: memberName,
    avatar_color: LOG_COLOR,
    action,
    detail,
  });
}

/* ---------------- 行程生命周期 ---------------- */

export function daysFromRange(startDate: string, endDate: string): { day_number: number; date: string; title: string; place: string }[] {
  return planDaysSync([], startDate, endDate).create.map(d => ({ day_number: d.dayNumber, date: d.date, title: '', place: '' }));
}

export async function createTrip(input: {
  title: string; destination: string; description: string;
  startDate: string; endDate: string; budget: number;
  coverEmoji: string; coverColor: string;
}, ownerName: string): Promise<string> {
  // share_token 挪用作属主锚点（见 listTrips 注释）；业务本身未使用该字段
  const meForAnchor = (await ensureProfile()) as unknown as Profile & { owner?: string };
  const trip = await createRow('gt_trips', {
    title: input.title,
    destination: input.destination,
    description: input.description,
    start_date: input.startDate,
    end_date: input.endDate,
    cover_emoji: input.coverEmoji,
    cover_color: input.coverColor,
    cover_image: null,
    budget: input.budget,
    visibility: 'private',
    share_token: meForAnchor.owner || '',
  });
  await createRow('gt_trip_members', {
    trip_id: trip.id,
    role: 'owner',
    display_name: ownerName,
    avatar_color: '#2f6e4f',
  });
  await createRows('gt_days', daysFromRange(input.startDate, input.endDate).map(d => ({ trip_id: trip.id, ...d })));
  await logActivity(trip.id, ownerName, '创建了行程');
  return trip.id;
}

/** 日期区间变更时重建 days（按 date 保留旧行；被删天先删其活动）。 */
export async function syncDays(tripId: string, startDate: string, endDate: string): Promise<void> {
  const existing = (await listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }])) as unknown as TripDay[];
  const plan = planDaysSync(existing.map(d => ({ id: d.id, date: d.date, dayNumber: d.dayNumber })), startDate, endDate);
  for (const id of plan.deleteIds) await deleteRows('gt_activities', { day_id: { $eq: id } });
  for (const id of plan.deleteIds) await deleteRow('gt_days', id);
  for (const k of plan.keep) if (k.dayNumberChanged) await updateRow('gt_days', k.id, { day_number: k.dayNumber });
  await createRows('gt_days', plan.create.map(d => ({ trip_id: tripId, day_number: d.dayNumber, date: d.date, title: '', place: '' })));
}

export async function updateTrip(tripId: string, patch: {
  title?: string; destination?: string; description?: string;
  startDate?: string; endDate?: string; budget?: number;
  coverEmoji?: string; coverColor?: string; coverImage?: string | null;
  visibility?: 'private' | 'link'; shareToken?: string | null;
}): Promise<void> {
  await updateRow('gt_trips', tripId, patch);
  if (patch.startDate && patch.endDate) await syncDays(tripId, patch.startDate, patch.endDate);
}

/** 删除行程：手动级联删 12 张子表（模型层无外键级联）。 */
export async function deleteTrip(tripId: string): Promise<void> {
  const children = [
    'gt_activities', 'gt_days', 'gt_expenses', 'gt_packing_items', 'gt_journal_notes',
    'gt_activity_log', 'gt_guide_cards', 'gt_travel_links', 'gt_trip_places', 'gt_trip_cash_items', 'gt_trip_members',
  ];
  for (const table of children) await deleteRows(table, { trip_id: { $eq: tripId } });
  await deleteRow('gt_trips', tripId);
}
