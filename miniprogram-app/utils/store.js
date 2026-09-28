"use strict";
const rdbTrip = require('./rdb/trip');
const ops = require('./rdb/ops');
const entities = require('./rdb/entities');
const seed = require('./rdb/seed');
const storage = require('./rdb/storage');
const sharedBudget = require('./rdb/shared/budget');
const AV_CLASSES = ['#2E92ED:av-blue', '#FFC414:av-yellow', '#2FA96E:av-green', '#FF8A5C:av-coral', '#7B8CFF:av-violet', '#2BB8A8:av-teal', '#93A5B8:av-gray'];
const FALLBACK_AVS = ['av-blue', 'av-yellow', 'av-green', 'av-coral', 'av-violet', 'av-gray'];
function avClass(color, seedName) {
    const hit = AV_CLASSES.find(p => p.indexOf((color || '').toUpperCase()) >= 0);
    if (hit)
        return hit.split(':')[1];
    if (seedName)
        return FALLBACK_AVS[(seedName.charCodeAt(0) || 65) % FALLBACK_AVS.length];
    return 'av-blue';
}
const KIND_CN = {
    sight: '游玩', food: '餐饮', hotel: '住宿', transport: '交通',
    shopping: '购物', show: '演出', other: '其他',
};
const CAT_META = {
    交通: { cat: 'car', catBg: 'grn', catColor: '#2FA96E' },
    住宿: { cat: 'bed', catBg: 'tea', catColor: '#2BB8A8' },
    餐饮: { cat: 'food', catBg: 'yel', catColor: '#FFC414' },
    门票: { cat: 'ticket', catBg: 'sky', catColor: '#2E92ED' },
    购物: { cat: 'shop', catBg: 'coral', catColor: '#FF8A5C' },
    娱乐: { cat: 'show', catBg: 'violet', catColor: '#7B8CFF' },
    其他: { cat: 'note', catBg: 'gray', catColor: '#93A5B8' },
};
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function week(dateStr) {
    const d = new Date((dateStr || '') + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : WEEK[d.getDay()];
}
function mmdd(dateStr) {
    return (dateStr || '').slice(5).replace('-', '.');
}
function timeText(ts) {
    if (!ts)
        return '';
    const d = new Date(ts);
    const now = new Date();
    const p = (x) => String(x).padStart(2, '0');
    if (d.toDateString() === now.toDateString())
        return p(d.getHours()) + ':' + p(d.getMinutes());
    return `${p(d.getMonth() + 1)}月${p(d.getDate())}日`;
}
/* ---------------- 内存态（data.js 同形） ---------------- */
const store = {
    _ready: false,
    _warmId: '', // 已预热/预热中的行程 id
    _inflight: null, // 进行中的 loadTrip Promise（去重复用）
    _inflightId: '',
    profile: null,
    trips: [],
    trip: null, // {id,title,city,start,days[],budgetTotal,members[],destination,endDate,budget,coverEmoji}
    days: [], // rdb 原始行
    stops: [], // 活动（参考字段：id/day/time/name/type/cost/note/lat/lng/place）
    bills: [], // 支出（参考字段 + rdb 原始字段）
    feed: [],
    members: [], // 成员（name/initial/av/id/role）
    expensesRaw: [],
    journal: [], // {id,author,mood,content,images[],dateStr}
    guideCards: [],
    links: [],
    places: [],
    packing: [],
};
function memberVM(m, i) {
    return {
        id: m.id,
        name: m.displayName,
        initial: (m.displayName || '?').slice(0, 1),
        av: avClass(m.avatarColor, m.displayName),
        role: m.role,
        avatarColor: m.avatarColor || '',
        idx: i,
    };
}
function tripVM(t, days, members) {
    return {
        id: t.id,
        title: t.title,
        city: t.destination || '',
        destination: t.destination || '',
        start: t.startDate,
        endDate: t.endDate,
        days: (days || []).map(d => ({ d: d.dayNumber, date: mmdd(d.date), rawDate: d.date, week: week(d.date), title: d.title || '', id: d.id })),
        budgetTotal: t.budget || 0,
        budget: t.budget || 0,
        coverEmoji: t.coverEmoji || '🧭',
        coverColor: t.coverColor || '#2E92ED',
        coverImage: t.coverImage || '',
        members: (members || []).map(memberVM),
        shareToken: t.shareToken || '',
    };
}
/* ---------------- 就绪与装载 ---------------- */
async function ready(force = false) {
    if (store._ready && !force)
        return;
    // 首屏只需身份 + 行程列表（两个都吃到 ensureProfile 会话缓存，~2 轮模型调用）
    store.profile = await rdbTrip.ensureProfile();
    store.trips = await rdbTrip.listTrips();
    store._ready = true;
    // 当前行程 bundle 后台预热：welcome 不再阻塞在 11 表聚合读上
    const cur = currentTripId();
    const target = store.trips.find(t => t.id === cur) || store.trips[0];
    if (target)
        warmTrip(target.id);
}
/** 后台预热当前行程 bundle；openTrip / trip-mode 经 loadTrip 复用同一 in-flight */
function warmTrip(tripId) {
    if (store._warmId === tripId)
        return;
    store._warmId = tripId;
    loadTrip(tripId).catch(() => { store._warmId = ''; });
}
async function listTripsSafe() {
    // 平台间歇：models.list 偶发空返回（devtools 实测），空结果延迟重试一次
    let trips = await rdbTrip.listTrips();
    if (!trips.length) {
        await new Promise(r => setTimeout(r, 900));
        trips = await rdbTrip.listTrips();
    }
    return trips;
}
async function refreshTrips() {
    store.trips = await listTripsSafe();
}
function currentTripId() {
    try {
        return wx.getStorageSync('gotrip:current-trip') || '';
    }
    catch (e) {
        return '';
    }
}
function setCurrentTrip(id) {
    try {
        wx.setStorageSync('gotrip:current-trip', id);
    }
    catch (e) { /* ignore */ }
}
async function loadTrip(tripId) {
    // in-flight 去重：预热与用户点击并发时复用同一 Promise（welcome→home 快速点卡场景）
    if (store._inflightId === tripId && store._inflight)
        return store._inflight;
    store._inflightId = tripId;
    const p = (async () => {
        const b = await rdbTrip.loadTripBundle(tripId);
        setCurrentTrip(tripId);
        store.days = b.days || [];
    store.members = (b.members || []).map(memberVM);
    store.trip = tripVM(b.trip, b.days, b.members);
    // 活动 → stops
    const dayNumById = {};
    for (const d of b.days || [])
        dayNumById[d.id] = d.dayNumber;
    store.stops = (b.activities || []).map(a => ({
        id: a.id,
        day: dayNumById[a.dayId] || 0,
        time: a.time || '',
        name: a.title,
        type: KIND_CN[a.kind] || '其他',
        kind: a.kind || 'other',
        cost: a.cost || 0,
        note: a.notes || '',
        place: a.place || '',
        lat: a.lat,
        lng: a.lng,
        status: a.status || '',
    }));
    // 支出 → bills
    const mIdx = {};
    store.members.forEach((m, i) => { mIdx[m.id] = i; });
    store.expensesRaw = b.expenses || [];
    store.bills = (b.expenses || []).map(e => {
        const meta = CAT_META[e.category] || CAT_META['其他'];
        let sharers = [];
        try {
            const ids = typeof e.participants === 'string' ? JSON.parse(e.participants || '[]') : (e.participants || []);
            sharers = ids.map(id => mIdx[id]).filter(i => i != null);
        }
        catch (err) {
            sharers = [];
        }
        return {
            id: e.id,
            day: e.date,
            title: e.title,
            cat: meta.cat, catBg: meta.catBg, catColor: meta.catColor,
            payerIdx: mIdx[e.payerMemberId] != null ? mIdx[e.payerMemberId] : 0,
            splitN: sharers.length || (store.members.length || 1),
            sharers,
            amount: e.amount,
            category: e.category,
            payerMemberId: e.payerMemberId,
            participants: e.participants,
        };
    });
    // 动态
    store.feed = (b.feed || []).map(f => ({
        name: f.memberName,
        initial: (f.memberName || '?').slice(0, 1),
        av: avClass(f.avatarColor, f.memberName),
        avatarColor: f.avatarColor || '',
        action: ' ' + (f.action || ''),
        desc: f.detail || '',
        time: timeText(f.createdAt),
        ts: f.createdAt || 0,
    })).sort((a, b2) => (b2.ts || 0) - (a.ts || 0));
    // 打包
    store.packing = b.packing || [];
    // 日志（fileID → 临时链接）
    const journal = b.journal || [];
    const ids = [];
    journal.forEach(j => (j.images || []).forEach((im) => { if (im && im.full)
        ids.push(im.full); }));
    let urlMap = {};
    try {
        urlMap = ids.length ? await storage.tempUrls(ids) : {};
    }
    catch (e) {
        urlMap = {};
    }
    store.journal = journal.map(j => ({
        id: j.id,
        author: memberName(j.authorMemberId),
        mood: j.mood || '📝',
        content: j.content || '',
        images: (j.images || []).map((im) => urlMap[im.full] || im.full || '').filter(Boolean),
        dateStr: j.createdAt ? timeText(j.createdAt) : '',
        ts: j.createdAt || 0,
    }));
    // 锦囊/链接/候选地点
    store.guideCards = (b.guideCards || []).map(c => ({ ...c, items: parseItems(c.items) }));
    store.links = b.links || [];
    store.places = b.places || [];
    })();
    store._inflight = p;
    try {
        return await p;
    }
    finally {
        if (store._inflightId === tripId) {
            store._inflight = null;
            store._inflightId = '';
        }
    }
}
function memberName(id) {
    const m = store.members.find(x => x.id === id);
    return m ? m.name : '我';
}
function parseItems(v) {
    if (v == null || v === '')
        return [];
    if (Array.isArray(v))
        return v;
    try {
        return JSON.parse(v);
    }
    catch (e) {
        return [];
    }
}
/* ---------------- 写穿透 ---------------- */
async function createTrip(payload) {
    const me = await readyProfile();
    const id = await rdbTrip.createTrip({
        title: payload.title, destination: payload.destination, description: '',
        startDate: payload.startDate, endDate: payload.endDate, budget: Number(payload.budget) || 0,
        coverEmoji: payload.coverEmoji || '🧭', coverColor: payload.coverColor || '#2E92ED',
    }, me.nickname);
    await refreshTrips();
    await loadTrip(id);
    return id;
}
async function deleteTripById(id) {
    const opsAny = ops;
    await opsAny.deleteTrip(id);
    if (currentTripId() === id) {
        try {
            wx.removeStorageSync('gotrip:current-trip');
        }
        catch (e) { /* ignore */ }
    }
    await refreshTrips();
}
async function readyProfile() {
    if (!store.profile)
        store.profile = await rdbTrip.ensureProfile();
    return store.profile;
}
function dayIdByNumber(n) {
    const d = store.days.find(x => x.dayNumber === n);
    return d ? d.id : '';
}
async function addActivity(dayNumber, payload) {
    const me = await readyProfile();
    await ops.createActivity(store.trip.id, dayIdByNumber(dayNumber), {
        title: payload.title, time: payload.time || '', place: payload.place || '',
        cost: Number(payload.cost) || 0, notes: payload.notes || '', kind: payload.kind || 'sight',
        lat: payload.lat ?? null, lng: payload.lng ?? null,
    }, me.nickname);
    await reload();
}
async function updateActivity(id, patch) {
    const me = await readyProfile();
    await ops.updateActivity(store.trip.id, id, patch, me.nickname);
    await reload();
}
async function deleteActivityById(id, title) {
    const me = await readyProfile();
    await ops.deleteActivity(store.trip.id, id, title, me.nickname);
    await reload();
}
/** 同天按时间串位换序（参考工程 shift 语义） */
async function swapActivityTimes(idA, idB) {
    const a = store.stops.find(x => x.id === idA);
    const b = store.stops.find(x => x.id === idB);
    if (!a || !b)
        return;
    const me = await readyProfile();
    await ops.updateActivity(store.trip.id, idA, { time: b.time }, me.nickname);
    await ops.updateActivity(store.trip.id, idB, { time: a.time }, me.nickname);
    await reload();
}
async function moveActivityToDay(id, targetDay) {
    const s = store.stops.find(x => x.id === id);
    if (!s)
        return;
    const me = await readyProfile();
    await ops.deleteActivity(store.trip.id, id, s.name, me.nickname);
    await ops.createActivity(store.trip.id, dayIdByNumber(targetDay), {
        title: s.name, time: s.time, place: s.place, cost: s.cost, notes: s.note, kind: s.kind,
        lat: s.lat, lng: s.lng,
    }, me.nickname);
    await reload();
}
async function addBill(payload) {
    const me = await readyProfile();
    await ops.createExpense(store.trip.id, {
        title: payload.title, amount: Number(payload.amount) || 0, category: payload.category,
        date: payload.date, payerMemberId: payload.payerMemberId,
        splitMode: 'equal', participants: payload.participants,
    }, me.nickname);
    await reload();
}
async function deleteBillById(id, title) {
    const me = await readyProfile();
    await ops.deleteExpense(store.trip.id, id, title, me.nickname);
    await reload();
}
async function togglePackingItem(id, done) {
    await ops.updatePackingItem(store.trip.id, id, { done }, '我');
}
async function addPackingItems(items) {
    await ops.createPackingItems(store.trip.id, items, '我');
    await reload();
}
async function publishJournal(content, mood, localPaths) {
    const me = await readyProfile();
    const imgs = [];
    for (const p of localPaths) {
        let src = p;
        try {
            const c = await wx.compressImage({ src: p, quality: 75 });
            src = c.tempFilePath;
        }
        catch (e) { /* 原图兜底 */ }
        const fileID = await storage.uploadImage(src, 'journal');
        imgs.push({ full: fileID, thumb: fileID });
    }
    await ops.createJournal(store.trip.id, {
        dayId: null, authorMemberId: (store.members[0] && store.members[0].id) || '',
        content, mood, images: imgs,
    }, (store.members[0] && store.members[0].name) || '我');
    await reload();
}
async function updateNickname(name) {
    const me = await readyProfile();
    await rdbTrip.updateProfile(me.id, { nickname: name });
    store.profile = { ...me, nickname: name };
}
async function deletePackingById(id) {
    await ops.deletePackingItem(store.trip.id, id);
    await reload();
}
async function deleteJournalById(id) {
    await ops.deleteJournal(store.trip.id, id);
    await reload();
}
async function reloadGuideCards() {
    store.guideCards = (await ops.listGuideCards(store.trip.id)).map((c) => ({ ...c, items: parseItems(c.items) }));
}
async function deleteGuideCardById(id) {
    await ops.deleteGuideCard(store.trip.id, id, '我');
    await reloadGuideCards();
}
async function reloadLinks() {
    store.links = await ops.listLinks(store.trip.id);
}
async function addLink(title, url) {
    const me = await readyProfile();
    await ops.createLink(store.trip.id, { title: title || url, url, source: /xiaohongshu|xhslink/i.test(url) ? '小红书' : '链接', note: '' }, me.nickname);
    await reloadLinks();
}
async function deleteLinkById(id) {
    await ops.deleteLink(store.trip.id, id);
    await reloadLinks();
}
async function reloadPlaces() {
    store.places = await ops.listPlaces(store.trip.id);
}
async function addPlace(payload) {
    const me = await readyProfile();
    await ops.createPlace(store.trip.id, {
        name: payload.name, kind: payload.kind || 'attraction', city: store.trip.city || '',
        address: payload.address || '', note: payload.note || '', candidate: true,
    }, me.nickname);
    await reloadPlaces();
}
async function deletePlaceById(id) {
    await ops.deletePlace(store.trip.id, id);
    await reloadPlaces();
}
async function reloadFeedOnly() {
    const logs = await entities.listRows('gt_activity_log', { trip_id: { $eq: store.trip.id } }, [{ created_at: 'desc' }], 60);
    store.feed = logs.map((f) => ({
        name: f.memberName, initial: (f.memberName || '?').slice(0, 1),
        av: avClass(f.avatarColor, f.memberName), avatarColor: f.avatarColor || '',
        action: ' ' + (f.action || ''), desc: f.detail || '', time: timeText(f.createdAt), ts: f.createdAt || 0,
    }));
}
async function importDemo() {
    const me = await readyProfile();
    const id = await seed.seedDemoTrip(me.nickname);
    await refreshTrips();
    await loadTrip(id);
}
/** 装载当前行程 bundle（home 选定后供所有子页使用） */
async function reload() {
    if (!store.trip)
        return;
    await loadTrip(store.trip.id);
}
/** 结算：最少转账（贪心，分单位守恒）——输入 bills/members，输出转账列表 */
function minimalTransfers() {
    const bal = {};
    for (const m of store.members)
        bal[m.idx] = 0;
    for (const b of store.bills) {
        const n = b.splitN || 1;
        const per = Math.round((b.amount * 100) / n) / 100;
        const pay = b.payerIdx != null ? b.payerIdx : 0;
        if (bal[pay] == null)
            bal[pay] = 0;
        bal[pay] += b.amount;
        for (const i of (b.sharers && b.sharers.length ? b.sharers : Object.keys(bal).map(Number))) {
            if (bal[i] == null)
                bal[i] = 0;
            bal[i] -= per;
        }
    }
    const creditors = Object.keys(bal).filter(i => bal[i] > 0.005).map(i => ({ i, v: bal[i] })).sort((a, b) => b.v - a.v);
    const debtors = Object.keys(bal).filter(i => bal[i] < -0.005).map(i => ({ i, v: -bal[i] })).sort((a, b) => b.v - a.v);
    const out = [];
    let a = 0, d = 0;
    while (a < creditors.length && d < debtors.length) {
        const pay = Math.min(creditors[a].v, debtors[d].v);
        out.push({ from: store.members[debtors[d].i]?.name || '?', to: store.members[creditors[a].i]?.name || '?', amount: Math.round(pay * 100) / 100 });
        creditors[a].v -= pay;
        debtors[d].v -= pay;
        if (creditors[a].v <= 0.005)
            a++;
        if (debtors[d].v <= 0.005)
            d++;
    }
    return out;
}
/* ---------------- 方法挂载到数据对象：require() 即用（无绑定二义） ---------------- */
store.ready = ready;
store.refreshTrips = refreshTrips;
store.loadTrip = loadTrip;
store.setCurrentTrip = setCurrentTrip;
store.currentTripId = currentTripId;
store.reload = reload;
store.createTrip = createTrip;
store.deleteTripById = deleteTripById;
store.importDemo = importDemo;
store.addActivity = addActivity;
store.updateActivity = updateActivity;
store.deleteActivityById = deleteActivityById;
store.swapActivityTimes = swapActivityTimes;
store.moveActivityToDay = moveActivityToDay;
store.addBill = addBill;
store.deleteBillById = deleteBillById;
store.togglePackingItem = togglePackingItem;
store.addPackingItems = addPackingItems;
store.deletePackingById = deletePackingById;
store.publishJournal = publishJournal;
store.deleteJournalById = deleteJournalById;
store.reloadGuideCards = reloadGuideCards;
store.deleteGuideCardById = deleteGuideCardById;
store.reloadLinks = reloadLinks;
store.addLink = addLink;
store.deleteLinkById = deleteLinkById;
store.reloadPlaces = reloadPlaces;
store.addPlace = addPlace;
store.deletePlaceById = deletePlaceById;
store.reloadFeedOnly = reloadFeedOnly;
store.updateNickname = updateNickname;
store.minimalTransfers = minimalTransfers;
store.avClass = avClass;
module.exports = store;
