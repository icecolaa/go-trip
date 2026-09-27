"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureProfile = ensureProfile;
exports.updateProfile = updateProfile;
exports.listTrips = listTrips;
exports.loadTripBundle = loadTripBundle;
exports.logActivity = logActivity;
exports.daysFromRange = daysFromRange;
exports.createTrip = createTrip;
exports.syncDays = syncDays;
exports.updateTrip = updateTrip;
exports.deleteTrip = deleteTrip;
/** 行程域数据层：profile、行程列表/聚合、增删改 + 活动日志副作用。 */
const budget_1 = require("./shared/budget");
const sync_days_1 = require("./shared/sync-days");
const entities_1 = require("./entities");
/* eslint-disable @typescript-eslint/no-explicit-any */
const LOG_COLOR = '#2f6e4f';
function parseJsonField(v, fallback) {
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
/* ---------------- profile ---------------- */
async function ensureProfile() {
    const rows = await (0, entities_1.listRows)('gt_users');
    if (rows.length)
        return rows[0];
    return (0, entities_1.createRow)('gt_users', {
        nickname: '微信用户',
        avatarColor: '#2f6e4f',
        bio: '',
        avatarUrl: null,
    });
}
async function updateProfile(id, patch) {
    await (0, entities_1.updateRow)('gt_users', id, patch);
}
/* ---------------- 行程列表 ---------------- */
async function listTrips() {
    // 平台限制（2026-09-27 实测）：无过滤条件的 models.list 一律返回空记录，必须带显式 where。
    // 锚点 = share_token 字段（模型已登记但业务未使用，挪用存 profile 行的 owner 值——
    // 平台自动维护的属主标识 weda_<openid>，跨会话稳定）。devtools 下 list 的行级过滤
    // 身份与 create 不一致（模拟器行为），业务锚点可同时绕开两处平台怪癖。真机同逻辑成立。
    const meRow = await ensureProfile();
    const anchor = meRow.owner || '';
    const trips = (await (0, entities_1.listRows)('gt_trips', anchor ? { share_token: { $eq: anchor } } : {}, [{ createdAt: 'desc' }]));
    if (!trips.length)
        return [];
    const out = [];
    for (const t of trips) {
        const [members, expenses, activities] = await Promise.all([
            (0, entities_1.listRows)('gt_trip_members', { trip_id: { $eq: t.id } }),
            (0, entities_1.listRows)('gt_expenses', { trip_id: { $eq: t.id } }),
            (0, entities_1.listRows)('gt_activities', { trip_id: { $eq: t.id } }),
        ]);
        const mem = members;
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
            totalSpent: Math.round(expenses.reduce((s, e) => s + e.amount, 0) * 100) / 100,
            activityCount: activities.length,
        });
    }
    return out;
}
/* ---------------- 行程聚合读 ---------------- */
async function loadTripBundle(tripId) {
    const trip = await (0, entities_1.getRowById)('gt_trips', tripId);
    if (!trip)
        throw new Error('行程不存在或无权访问');
    const [members, days, activities, expenses, packing, journal, feed, places, cash, links, guideCards] = await Promise.all([
        (0, entities_1.listRows)('gt_trip_members', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
        (0, entities_1.listRows)('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }]),
        (0, entities_1.listRows)('gt_activities', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]),
        (0, entities_1.listRows)('gt_expenses', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
        (0, entities_1.listRows)('gt_packing_items', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
        (0, entities_1.listRows)('gt_journal_notes', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }]),
        (0, entities_1.listRows)('gt_activity_log', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }], 60),
        (0, entities_1.listRows)('gt_trip_places', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]),
        (0, entities_1.listRows)('gt_trip_cash_items', { trip_id: { $eq: tripId } }, [{ created_at: 'asc' }]),
        (0, entities_1.listRows)('gt_travel_links', { trip_id: { $eq: tripId } }, [{ created_at: 'desc' }]),
        (0, entities_1.listRows)('gt_guide_cards', { trip_id: { $eq: tripId } }, [{ sort: 'asc' }]),
    ]);
    const mem = members;
    const exp = expenses.map(e => ({ ...e, participants: parseJsonField(e.participants, []) }));
    const budget = (0, budget_1.calcBudget)(exp, mem);
    return {
        trip: trip,
        members: mem,
        days: days,
        activities: activities,
        expenses: exp,
        budget,
        packing: packing,
        journal: journal.map(j => ({ ...j, images: parseJsonField(j.images, []) })),
        feed: feed,
        places: places,
        cash: cash,
        links: links,
        guideCards: guideCards.map(c => ({ ...c, items: parseJsonField(c.items, []) })),
    };
}
/* ---------------- 副作用 ---------------- */
async function logActivity(tripId, memberName, action, detail = '') {
    await (0, entities_1.createRow)('gt_activity_log', {
        trip_id: tripId,
        member_name: memberName,
        avatar_color: LOG_COLOR,
        action,
        detail,
    });
}
/* ---------------- 行程生命周期 ---------------- */
function daysFromRange(startDate, endDate) {
    return (0, sync_days_1.planDaysSync)([], startDate, endDate).create.map(d => ({ day_number: d.dayNumber, date: d.date, title: '', place: '' }));
}
async function createTrip(input, ownerName) {
    // share_token 挪用作属主锚点（见 listTrips 注释）；业务本身未使用该字段
    const meForAnchor = (await ensureProfile());
    const trip = await (0, entities_1.createRow)('gt_trips', {
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
    await (0, entities_1.createRow)('gt_trip_members', {
        trip_id: trip.id,
        role: 'owner',
        display_name: ownerName,
        avatar_color: '#2f6e4f',
    });
    await (0, entities_1.createRows)('gt_days', daysFromRange(input.startDate, input.endDate).map(d => ({ trip_id: trip.id, ...d })));
    await logActivity(trip.id, ownerName, '创建了行程');
    return trip.id;
}
/** 日期区间变更时重建 days（按 date 保留旧行；被删天先删其活动）。 */
async function syncDays(tripId, startDate, endDate) {
    const existing = (await (0, entities_1.listRows)('gt_days', { trip_id: { $eq: tripId } }, [{ day_number: 'asc' }]));
    const plan = (0, sync_days_1.planDaysSync)(existing.map(d => ({ id: d.id, date: d.date, dayNumber: d.dayNumber })), startDate, endDate);
    for (const id of plan.deleteIds)
        await (0, entities_1.deleteRows)('gt_activities', { day_id: { $eq: id } });
    for (const id of plan.deleteIds)
        await (0, entities_1.deleteRow)('gt_days', id);
    for (const k of plan.keep)
        if (k.dayNumberChanged)
            await (0, entities_1.updateRow)('gt_days', k.id, { day_number: k.dayNumber });
    await (0, entities_1.createRows)('gt_days', plan.create.map(d => ({ trip_id: tripId, day_number: d.dayNumber, date: d.date, title: '', place: '' })));
}
async function updateTrip(tripId, patch) {
    await (0, entities_1.updateRow)('gt_trips', tripId, patch);
    if (patch.startDate && patch.endDate)
        await syncDays(tripId, patch.startDate, patch.endDate);
}
/** 删除行程：手动级联删 12 张子表（模型层无外键级联）。 */
async function deleteTrip(tripId) {
    const children = [
        'gt_activities', 'gt_days', 'gt_expenses', 'gt_packing_items', 'gt_journal_notes',
        'gt_activity_log', 'gt_guide_cards', 'gt_travel_links', 'gt_trip_places', 'gt_trip_cash_items', 'gt_trip_members',
    ];
    for (const table of children)
        await (0, entities_1.deleteRows)(table, { trip_id: { $eq: tripId } });
    await (0, entities_1.deleteRow)('gt_trips', tripId);
}
