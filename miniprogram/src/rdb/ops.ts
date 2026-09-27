/** 各实体操作（写后自动记活动日志；JSON 字段在此层转换）。
 * 页面只调这些函数，不直接摸 entities。 */
import type {
  Activity, Expense, GuideCard, JournalImage, JournalNote, PackingItem, TripCashItem,
  TripMember, TripPlace, TravelLink, TripDay,
} from '../types'
import { createRow, createRows, deleteRow, deleteRows, listRows, updateRow } from './entities'
import { logActivity } from './trip'

/* eslint-disable @typescript-eslint/no-explicit-any */

function json<T>(v: any, fallback: T): T {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

/* ---------------- 行程删除（级联清理行程相关表；活动日志随行程消失，无需记录） ---------------- */

const TRIP_SCOPED_TABLES = [
  'gt_activities', 'gt_days', 'gt_trip_members', 'gt_expenses', 'gt_packing_items',
  'gt_journal_notes', 'gt_guide_cards', 'gt_travel_links', 'gt_trip_places',
  'gt_trip_cash_items', 'gt_activity_log',
] as const;

/** 删除整场旅程：先清子表再删主行（任一步失败即抛出，主行保留可重试）。 */
export const deleteTrip = async (tripId: string): Promise<void> => {
  for (const table of TRIP_SCOPED_TABLES) {
    await deleteRows(table, { trip_id: { $eq: tripId } });
  }
  await deleteRow('gt_trips', tripId);
};

/* ---------------- 占位成员 ---------------- */

export const listMembers = (tripId: string) =>
  listRows('gt_trip_members', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]) as Promise<TripMember[]>;

export const createMember = async (tripId: string, displayName: string, memberName: string) => {
  const m = await createRow('gt_trip_members', {
    trip_id: tripId, role: 'editor', display_name: displayName, avatar_color: '#8a6d3b',
  }) as unknown as TripMember;
  await logActivity(tripId, memberName, '添加了同伴', displayName);
  return m;
};

export const updateMember = async (tripId: string, id: string, patch: Partial<TripMember>, memberName: string) => {
  await updateRow('gt_trip_members', id, patch);
  await logActivity(tripId, memberName, '更新了同伴', patch.displayName || '');
};

export const deleteMember = async (tripId: string, id: string, name: string, memberName: string) => {
  await deleteRow('gt_trip_members', id);
  await logActivity(tripId, memberName, '移除了同伴', name);
};

/* ---------------- 天 ---------------- */

export const listDays = (tripId: string) =>
  listRows('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }]) as Promise<TripDay[]>;

/* ---------------- 活动 ---------------- */

export const createActivity = async (tripId: string, dayId: string, data: Partial<Activity>, memberName: string) => {
  const existing = await listRows('gt_activities', { day_id: { $eq: dayId } });
  const a = await createRow('gt_activities', {
    trip_id: tripId, day_id: dayId, sort: existing.length,
    time: null, end_time: null, kind: 'sight', title: '', place: '',
    lat: null, lng: null, cost: 0, notes: '', status: null, assignee_member_id: null,
    ...data,
  }) as unknown as Activity;
  await logActivity(tripId, memberName, '添加了活动', a.title);
  return a;
};

export const updateActivity = async (tripId: string, id: string, patch: Partial<Activity>, memberName: string) => {
  await updateRow('gt_activities', id, patch);
  await logActivity(tripId, memberName, patch.status != null ? '更新了活动状态' : '修改了活动', patch.title || '');
};

export const deleteActivity = async (tripId: string, id: string, title: string, memberName: string) => {
  await deleteRow('gt_activities', id);
  await logActivity(tripId, memberName, '删除了活动', title);
};

export const reorderActivities = async (tripId: string, ordered: { id: string; dayId: string; sort: number }[], memberName: string) => {
  for (const o of ordered) await updateRow('gt_activities', o.id, { day_id: o.dayId, sort: o.sort });
  await logActivity(tripId, memberName, '调整了活动顺序');
};

/* ---------------- 记账 ---------------- */

export const listExpenses = (tripId: string) =>
  listRows('gt_expenses', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]) as Promise<Expense[]>;

export const createExpense = async (tripId: string, data: Omit<Expense, 'id'>, memberName: string) => {
  const e = await createRow('gt_expenses', {
    trip_id: tripId,
    payer_member_id: data.payerMemberId,
    amount: data.amount,
    category: data.category,
    title: data.title,
    date: data.date,
    split_mode: data.splitMode,
    participants: JSON.stringify(data.participants),
  }) as unknown as Expense;
  await logActivity(tripId, memberName, '记了一笔账', `${data.title} ¥${data.amount}`);
  return e;
};

export const deleteExpense = async (tripId: string, id: string, title: string, memberName: string) => {
  await deleteRow('gt_expenses', id);
  await logActivity(tripId, memberName, '删除了账目', title);
};

/* ---------------- 打包清单 ---------------- */

export const createPackingItems = async (tripId: string, items: Partial<PackingItem>[], memberName: string) => {
  await createRows('gt_packing_items', items.map(i => ({
    trip_id: tripId, category: '其他', title: '', done: false,
    assignee_member_id: null, quantity: 1, note: '', ...i,
  })));
  await logActivity(tripId, memberName, '添加了打包物品', `${items.length} 件`);
};

export const updatePackingItem = async (tripId: string, id: string, patch: Partial<PackingItem>, memberName: string) => {
  await updateRow('gt_packing_items', id, patch);
  if (patch.done != null) await logActivity(tripId, memberName, patch.done ? '打包了物品' : '取消打包');
};

export const deletePackingItem = async (tripId: string, id: string, memberName: string) => {
  await deleteRow('gt_packing_items', id);
};

/* ---------------- 日志 ---------------- */

export const createJournal = async (tripId: string, data: {
  dayId: string | null; authorMemberId: string; content: string; mood: string; images: JournalImage[];
}, memberName: string) => {
  const j = await createRow('gt_journal_notes', {
    trip_id: tripId, day_id: data.dayId, author_member_id: data.authorMemberId,
    content: data.content, mood: data.mood, images: JSON.stringify(data.images),
  }) as unknown as JournalNote;
  await logActivity(tripId, memberName, '写了一条日志');
  return j;
};

export const updateJournal = async (tripId: string, id: string, patch: { content?: string; mood?: string; images?: JournalImage[] }) => {
  await updateRow('gt_journal_notes', id, {
    ...(patch.content != null ? { content: patch.content } : {}),
    ...(patch.mood != null ? { mood: patch.mood } : {}),
    ...(patch.images != null ? { images: JSON.stringify(patch.images) } : {}),
    // 模型层自动更新 updatedAt
  });
};

export const deleteJournal = async (tripId: string, id: string) => {
  await deleteRow('gt_journal_notes', id);
};

/* ---------------- 锦囊 ---------------- */

/** items 库内统一存 JSON 字符串；此函数幂等（已是字符串则原样，避免双重编码）。 */
function encodeItems(items: unknown): string {
  return typeof items === 'string' ? items : JSON.stringify(items ?? []);
}

function decodeItems(v: unknown): GuideCard['items'] {
  if (v == null || v === '') return [];
  if (typeof v !== 'string') return v as GuideCard['items'];
  try { return JSON.parse(v) as GuideCard['items']; } catch { return []; }
}

export const listGuideCards = async (tripId: string): Promise<GuideCard[]> => {
  const rows = await listRows('gt_guide_cards', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]) as unknown as GuideCard[];
  return rows.map(c => ({ ...c, items: decodeItems(c.items) }));
};

export const createGuideCards = async (tripId: string, cards: Omit<GuideCard, 'id'>[], memberName: string) => {
  await createRows('gt_guide_cards', cards.map(c => ({ ...c, items: encodeItems((c as any).items) })));
  await logActivity(tripId, memberName, '生成了锦囊');
};

export const createGuideCard = async (tripId: string, card: Omit<GuideCard, 'id'>, memberName: string) => {
  await createRow('gt_guide_cards', { ...card, items: encodeItems((card as any).items) });
  await logActivity(tripId, memberName, '添加了锦囊卡片', card.title);
};

export const deleteGuideCard = async (tripId: string, id: string, memberName: string) => {
  await deleteRow('gt_guide_cards', id);
};

/* ---------------- 链接收藏 ---------------- */

export const createLink = async (tripId: string, data: Omit<TravelLink, 'id'>, memberName: string) => {
  await createRow('gt_travel_links', { trip_id: tripId, ...data });
  await logActivity(tripId, memberName, '收藏了链接', data.title);
};

export const deleteLink = async (tripId: string, id: string) => {
  await deleteRow('gt_travel_links', id);
};

export const listLinks = (tripId: string) =>
  listRows('gt_travel_links', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }]) as Promise<TravelLink[]>;

/* ---------------- 候选地点 ---------------- */

export const createPlace = async (tripId: string, data: Partial<TripPlace>, memberName: string) => {
  const existing = await listRows('gt_trip_places', { trip_id: { $eq: tripId } });
  await createRow('gt_trip_places', {
    trip_id: tripId, kind: 'attraction', name: '', city: '', address: '',
    lat: null, lng: null, note: '', dishes: '', status: '待确认', candidate: true, sort: existing.length,
    ...data,
  });
  await logActivity(tripId, memberName, '添加了候选地点', data.name || '');
};

export const updatePlace = async (tripId: string, id: string, patch: Partial<TripPlace>, memberName: string) => {
  await updateRow('gt_trip_places', id, patch);
};

export const deletePlace = async (tripId: string, id: string) => {
  await deleteRow('gt_trip_places', id);
};

export const listPlaces = (tripId: string) =>
  listRows('gt_trip_places', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]) as Promise<TripPlace[]>;

/* ---------------- 现金项 ---------------- */

export const createCash = async (tripId: string, data: Omit<TripCashItem, 'id'>, memberName: string) => {
  await createRow('gt_trip_cash_items', {
    trip_id: tripId,
    title: data.title, amount: data.amount, currency: data.currency || 'CNY',
    per_person: data.perPerson, people: data.people,
    total: data.perPerson ? data.amount * data.people : data.amount, // 合计只在写入时算一次
    day_id: data.dayId, ref_kind: data.refKind, ref_id: data.refId,
  });
  await logActivity(tripId, memberName, '添加了现金项', data.title);
};

export const deleteCash = async (tripId: string, id: string, memberName: string) => {
  await deleteRow('gt_trip_cash_items', id);
};

export const listCash = (tripId: string) =>
  listRows('gt_trip_cash_items', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]) as Promise<TripCashItem[]>;

/* ---------------- 飞哪儿价格记忆（按用户私有） ---------------- */

export async function rememberPrice(routeKey: string, city: string, minPerPerson: number): Promise<number | null> {
  const rows = await listRows('gt_flywhere_watch', { route_key: { $eq: routeKey } });
  const prev = rows[0] ? (rows[0] as any).minPerPerson as number | null : null;
  if (rows[0]) await updateRow('gt_flywhere_watch', rows[0].id, { min_per_person: minPerPerson, checked_at: new Date().toISOString() });
  else await createRow('gt_flywhere_watch', { route_key: routeKey, city, min_per_person: minPerPerson, checked_at: new Date().toISOString() });
  return typeof prev === 'number' ? prev : null;
}
