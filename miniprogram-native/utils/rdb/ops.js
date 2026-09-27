"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCash = exports.deleteCash = exports.createCash = exports.listPlaces = exports.deletePlace = exports.updatePlace = exports.createPlace = exports.listLinks = exports.deleteLink = exports.createLink = exports.deleteGuideCard = exports.createGuideCard = exports.createGuideCards = exports.listGuideCards = exports.deleteJournal = exports.updateJournal = exports.createJournal = exports.deletePackingItem = exports.updatePackingItem = exports.createPackingItems = exports.deleteExpense = exports.createExpense = exports.listExpenses = exports.reorderActivities = exports.deleteActivity = exports.updateActivity = exports.createActivity = exports.listDays = exports.deleteMember = exports.updateMember = exports.createMember = exports.listMembers = exports.deleteTrip = void 0;
exports.rememberPrice = rememberPrice;
const entities_1 = require("./entities");
const trip_1 = require("./trip");
/* eslint-disable @typescript-eslint/no-explicit-any */
function json(v, fallback) {
    if (v == null || v === '')
        return fallback;
    if (typeof v !== 'string')
        return v;
    try {
        return JSON.parse(v);
    }
    catch {
        return fallback;
    }
}
/* ---------------- 行程删除（级联清理行程相关表；活动日志随行程消失，无需记录） ---------------- */
const TRIP_SCOPED_TABLES = [
    'gt_activities', 'gt_days', 'gt_trip_members', 'gt_expenses', 'gt_packing_items',
    'gt_journal_notes', 'gt_guide_cards', 'gt_travel_links', 'gt_trip_places',
    'gt_trip_cash_items', 'gt_activity_log',
];
/** 删除整场旅程：先清子表再删主行（任一步失败即抛出，主行保留可重试）。 */
const deleteTrip = async (tripId) => {
    for (const table of TRIP_SCOPED_TABLES) {
        await (0, entities_1.deleteRows)(table, { trip_id: { $eq: tripId } });
    }
    await (0, entities_1.deleteRow)('gt_trips', tripId);
};
exports.deleteTrip = deleteTrip;
/* ---------------- 占位成员 ---------------- */
const listMembers = (tripId) => (0, entities_1.listRows)('gt_trip_members', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]);
exports.listMembers = listMembers;
const createMember = async (tripId, displayName, memberName) => {
    const m = await (0, entities_1.createRow)('gt_trip_members', {
        trip_id: tripId, role: 'editor', display_name: displayName, avatar_color: '#8a6d3b',
    });
    await (0, trip_1.logActivity)(tripId, memberName, '添加了同伴', displayName);
    return m;
};
exports.createMember = createMember;
const updateMember = async (tripId, id, patch, memberName) => {
    await (0, entities_1.updateRow)('gt_trip_members', id, patch);
    await (0, trip_1.logActivity)(tripId, memberName, '更新了同伴', patch.displayName || '');
};
exports.updateMember = updateMember;
const deleteMember = async (tripId, id, name, memberName) => {
    await (0, entities_1.deleteRow)('gt_trip_members', id);
    await (0, trip_1.logActivity)(tripId, memberName, '移除了同伴', name);
};
exports.deleteMember = deleteMember;
/* ---------------- 天 ---------------- */
const listDays = (tripId) => (0, entities_1.listRows)('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }]);
exports.listDays = listDays;
/* ---------------- 活动 ---------------- */
const createActivity = async (tripId, dayId, data, memberName) => {
    const existing = await (0, entities_1.listRows)('gt_activities', { day_id: { $eq: dayId } });
    const a = await (0, entities_1.createRow)('gt_activities', {
        trip_id: tripId, day_id: dayId, sort: existing.length,
        time: null, end_time: null, kind: 'sight', title: '', place: '',
        lat: null, lng: null, cost: 0, notes: '', status: null, assignee_member_id: null,
        ...data,
    });
    await (0, trip_1.logActivity)(tripId, memberName, '添加了活动', a.title);
    return a;
};
exports.createActivity = createActivity;
const updateActivity = async (tripId, id, patch, memberName) => {
    await (0, entities_1.updateRow)('gt_activities', id, patch);
    await (0, trip_1.logActivity)(tripId, memberName, patch.status != null ? '更新了活动状态' : '修改了活动', patch.title || '');
};
exports.updateActivity = updateActivity;
const deleteActivity = async (tripId, id, title, memberName) => {
    await (0, entities_1.deleteRow)('gt_activities', id);
    await (0, trip_1.logActivity)(tripId, memberName, '删除了活动', title);
};
exports.deleteActivity = deleteActivity;
const reorderActivities = async (tripId, ordered, memberName) => {
    for (const o of ordered)
        await (0, entities_1.updateRow)('gt_activities', o.id, { day_id: o.dayId, sort: o.sort });
    await (0, trip_1.logActivity)(tripId, memberName, '调整了活动顺序');
};
exports.reorderActivities = reorderActivities;
/* ---------------- 记账 ---------------- */
const listExpenses = (tripId) => (0, entities_1.listRows)('gt_expenses', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]);
exports.listExpenses = listExpenses;
const createExpense = async (tripId, data, memberName) => {
    const e = await (0, entities_1.createRow)('gt_expenses', {
        trip_id: tripId,
        payer_member_id: data.payerMemberId,
        amount: data.amount,
        category: data.category,
        title: data.title,
        date: data.date,
        split_mode: data.splitMode,
        participants: JSON.stringify(data.participants),
    });
    await (0, trip_1.logActivity)(tripId, memberName, '记了一笔账', `${data.title} ¥${data.amount}`);
    return e;
};
exports.createExpense = createExpense;
const deleteExpense = async (tripId, id, title, memberName) => {
    await (0, entities_1.deleteRow)('gt_expenses', id);
    await (0, trip_1.logActivity)(tripId, memberName, '删除了账目', title);
};
exports.deleteExpense = deleteExpense;
/* ---------------- 打包清单 ---------------- */
const createPackingItems = async (tripId, items, memberName) => {
    await (0, entities_1.createRows)('gt_packing_items', items.map(i => ({
        trip_id: tripId, category: '其他', title: '', done: false,
        assignee_member_id: null, quantity: 1, note: '', ...i,
    })));
    await (0, trip_1.logActivity)(tripId, memberName, '添加了打包物品', `${items.length} 件`);
};
exports.createPackingItems = createPackingItems;
const updatePackingItem = async (tripId, id, patch, memberName) => {
    await (0, entities_1.updateRow)('gt_packing_items', id, patch);
    if (patch.done != null)
        await (0, trip_1.logActivity)(tripId, memberName, patch.done ? '打包了物品' : '取消打包');
};
exports.updatePackingItem = updatePackingItem;
const deletePackingItem = async (tripId, id, memberName) => {
    await (0, entities_1.deleteRow)('gt_packing_items', id);
};
exports.deletePackingItem = deletePackingItem;
/* ---------------- 日志 ---------------- */
const createJournal = async (tripId, data, memberName) => {
    const j = await (0, entities_1.createRow)('gt_journal_notes', {
        trip_id: tripId, day_id: data.dayId, author_member_id: data.authorMemberId,
        content: data.content, mood: data.mood, images: JSON.stringify(data.images),
    });
    await (0, trip_1.logActivity)(tripId, memberName, '写了一条日志');
    return j;
};
exports.createJournal = createJournal;
const updateJournal = async (tripId, id, patch) => {
    await (0, entities_1.updateRow)('gt_journal_notes', id, {
        ...(patch.content != null ? { content: patch.content } : {}),
        ...(patch.mood != null ? { mood: patch.mood } : {}),
        ...(patch.images != null ? { images: JSON.stringify(patch.images) } : {}),
        // 模型层自动更新 updatedAt
    });
};
exports.updateJournal = updateJournal;
const deleteJournal = async (tripId, id) => {
    await (0, entities_1.deleteRow)('gt_journal_notes', id);
};
exports.deleteJournal = deleteJournal;
/* ---------------- 锦囊 ---------------- */
/** items 库内统一存 JSON 字符串；此函数幂等（已是字符串则原样，避免双重编码）。 */
function encodeItems(items) {
    return typeof items === 'string' ? items : JSON.stringify(items ?? []);
}
function decodeItems(v) {
    if (v == null || v === '')
        return [];
    if (typeof v !== 'string')
        return v;
    try {
        return JSON.parse(v);
    }
    catch {
        return [];
    }
}
const listGuideCards = async (tripId) => {
    const rows = await (0, entities_1.listRows)('gt_guide_cards', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]);
    return rows.map(c => ({ ...c, items: decodeItems(c.items) }));
};
exports.listGuideCards = listGuideCards;
const createGuideCards = async (tripId, cards, memberName) => {
    await (0, entities_1.createRows)('gt_guide_cards', cards.map(c => ({ ...c, items: encodeItems(c.items) })));
    await (0, trip_1.logActivity)(tripId, memberName, '生成了锦囊');
};
exports.createGuideCards = createGuideCards;
const createGuideCard = async (tripId, card, memberName) => {
    await (0, entities_1.createRow)('gt_guide_cards', { ...card, items: encodeItems(card.items) });
    await (0, trip_1.logActivity)(tripId, memberName, '添加了锦囊卡片', card.title);
};
exports.createGuideCard = createGuideCard;
const deleteGuideCard = async (tripId, id, memberName) => {
    await (0, entities_1.deleteRow)('gt_guide_cards', id);
};
exports.deleteGuideCard = deleteGuideCard;
/* ---------------- 链接收藏 ---------------- */
const createLink = async (tripId, data, memberName) => {
    await (0, entities_1.createRow)('gt_travel_links', { trip_id: tripId, ...data });
    await (0, trip_1.logActivity)(tripId, memberName, '收藏了链接', data.title);
};
exports.createLink = createLink;
const deleteLink = async (tripId, id) => {
    await (0, entities_1.deleteRow)('gt_travel_links', id);
};
exports.deleteLink = deleteLink;
const listLinks = (tripId) => (0, entities_1.listRows)('gt_travel_links', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }]);
exports.listLinks = listLinks;
/* ---------------- 候选地点 ---------------- */
const createPlace = async (tripId, data, memberName) => {
    const existing = await (0, entities_1.listRows)('gt_trip_places', { trip_id: { $eq: tripId } });
    await (0, entities_1.createRow)('gt_trip_places', {
        trip_id: tripId, kind: 'attraction', name: '', city: '', address: '',
        lat: null, lng: null, note: '', dishes: '', status: '待确认', candidate: true, sort: existing.length,
        ...data,
    });
    await (0, trip_1.logActivity)(tripId, memberName, '添加了候选地点', data.name || '');
};
exports.createPlace = createPlace;
const updatePlace = async (tripId, id, patch, memberName) => {
    await (0, entities_1.updateRow)('gt_trip_places', id, patch);
};
exports.updatePlace = updatePlace;
const deletePlace = async (tripId, id) => {
    await (0, entities_1.deleteRow)('gt_trip_places', id);
};
exports.deletePlace = deletePlace;
const listPlaces = (tripId) => (0, entities_1.listRows)('gt_trip_places', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]);
exports.listPlaces = listPlaces;
/* ---------------- 现金项 ---------------- */
const createCash = async (tripId, data, memberName) => {
    await (0, entities_1.createRow)('gt_trip_cash_items', {
        trip_id: tripId,
        title: data.title, amount: data.amount, currency: data.currency || 'CNY',
        per_person: data.perPerson, people: data.people,
        total: data.perPerson ? data.amount * data.people : data.amount, // 合计只在写入时算一次
        day_id: data.dayId, ref_kind: data.refKind, ref_id: data.refId,
    });
    await (0, trip_1.logActivity)(tripId, memberName, '添加了现金项', data.title);
};
exports.createCash = createCash;
const deleteCash = async (tripId, id, memberName) => {
    await (0, entities_1.deleteRow)('gt_trip_cash_items', id);
};
exports.deleteCash = deleteCash;
const listCash = (tripId) => (0, entities_1.listRows)('gt_trip_cash_items', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]);
exports.listCash = listCash;
/* ---------------- 飞哪儿价格记忆（按用户私有） ---------------- */
async function rememberPrice(routeKey, city, minPerPerson) {
    const rows = await (0, entities_1.listRows)('gt_flywhere_watch', { route_key: { $eq: routeKey } });
    const prev = rows[0] ? rows[0].minPerPerson : null;
    if (rows[0])
        await (0, entities_1.updateRow)('gt_flywhere_watch', rows[0].id, { min_per_person: minPerPerson, checked_at: new Date().toISOString() });
    else
        await (0, entities_1.createRow)('gt_flywhere_watch', { route_key: routeKey, city, min_per_person: minPerPerson, checked_at: new Date().toISOString() });
    return typeof prev === 'number' ? prev : null;
}
