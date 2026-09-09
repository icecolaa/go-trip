import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from './db.ts';
import { ApiError, json, readBody, nowISO, todayStr, addDays, daysBetween, randomCode } from './util.ts';
import { requireAuth, getUserByToken, tokenFromRequest, hashPassword, verifyPassword, createSession, destroySession, setAuthCookie, clearAuthCookie, allocateTravelId, type SessionUser } from './auth.ts';
import { calcBudget } from './budget.ts';
import { searchPois } from './poi.ts';
import { getWeather } from './weather.ts';
import { parseGuide, generatePlan, aiConfigured } from './ai.ts';
import { buildHandbook, aiHandbook } from './handbook.ts';
import { answerUsageQuestion, sanitizeHistory } from './assistant.ts';
import { onlineMemberIds, broadcastToTrip } from './ws.ts';
import type { Trip, TripMember, Invite, TripDay, Activity, Expense, PackingItem, JournalNote, ActivityLogEntry, MemberRole, TripBundle, ParsedGuide, GuideCard } from '../../shared/types.ts';

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/* ------------------------- 通用辅助 ------------------------- */

async function memberOf(tripId: number, userId: number): Promise<TripMember | null> {
  const row = await db().prepare('SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId) as any;
  return row ? await rowToMember(row) : null;
}

async function rowToMember(r: any): Promise<TripMember> {
  let user = null;
  if (r.user_id) {
    const u = await db().prepare('SELECT id, travel_id, username, nickname, avatar_color FROM users WHERE id = ?').get(r.user_id) as any;
    if (u) user = { id: u.id, travelId: u.travel_id, username: u.username, nickname: u.nickname, avatarColor: u.avatar_color };
  }
  return {
    id: r.id, tripId: r.trip_id, userId: r.user_id, role: r.role, displayName: r.display_name,
    avatarColor: r.avatar_color, location: r.location, locationLat: r.location_lat, locationLng: r.location_lng,
    locationAt: r.location_at, joinedAt: r.joined_at, user,
  };
}

async function requireMember(tripId: number, user: SessionUser, minRole: MemberRole = 'viewer'): Promise<TripMember> {
  const m = await memberOf(tripId, user.id);
  if (!m) throw new ApiError(403, '你还不是该旅程的成员');
  if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) throw new ApiError(403, '权限不足');
  return m;
}

async function requireTrip(tripId: number): Promise<Trip> {
  const t = await db().prepare('SELECT * FROM trips WHERE id = ?').get(tripId) as any;
  if (!t) throw new ApiError(404, '旅程不存在');
  return rowToTrip(t);
}

function rowToTrip(r: any): Trip {
  return {
    id: r.id, ownerId: r.owner_id, title: r.title, destination: r.destination, description: r.description,
    startDate: r.start_date, endDate: r.end_date, coverEmoji: r.cover_emoji, coverColor: r.cover_color,
    budget: r.budget, visibility: r.visibility, shareToken: r.share_token, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function touchTrip(tripId: number): Promise<void> {
  await db().prepare('UPDATE trips SET updated_at = ? WHERE id = ?').run(nowISO(), tripId);
}

async function logActivity(tripId: number, m: TripMember | null, action: string, detail: string): Promise<void> {
  await db().prepare('INSERT INTO activity_log (trip_id, user_id, member_name, avatar_color, action, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(tripId, m?.userId ?? null, m?.displayName || '有人', m?.avatarColor || '#2f6e4f', action, detail, nowISO());
}

function notify(tripId: number, entity: string, action: string, byMemberId: number): void {
  broadcastToTrip(tripId, { type: 'change', tripId, entity, action, byMemberId });
}

/** 依据行程起止日期重建 days 表（保留已有天数内容） */
async function syncDays(trip: Trip): Promise<TripDay[]> {
  const d = db();
  const total = daysBetween(trip.startDate, trip.endDate);
  const existing = await d.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').all(trip.id) as any[];
  const byDate = new Map(existing.map(e => [e.date, e]));
  const keepIds = new Set<number>();
  const days: TripDay[] = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(trip.startDate, i);
    const hit = byDate.get(date);
    let row: any;
    if (hit) {
      row = hit;
      if (row.day_number !== i + 1) await d.prepare('UPDATE days SET day_number = ? WHERE id = ?').run(i + 1, row.id);
    } else {
      const r = await d.prepare('INSERT INTO days (trip_id, day_number, date, title, place) VALUES (?,?,?,?,?)')
        .run(trip.id, i + 1, date, '', trip.destination || '');
      row = { id: Number(r.lastInsertRowid), trip_id: trip.id, day_number: i + 1, date, title: '', place: trip.destination || '' };
    }
    keepIds.add(row.id);
    days.push({ id: row.id, tripId: trip.id, dayNumber: i + 1, date, title: row.title || '', place: row.place || '' });
  }
  for (const e of existing) {
    if (!keepIds.has(e.id)) await d.prepare('DELETE FROM days WHERE id = ?').run(e.id);
  }
  return days;
}

async function tripBundle(tripId: number, user: SessionUser | null): Promise<TripBundle> {
  const trip = await requireTrip(tripId);
  const memberRows = await db().prepare('SELECT * FROM trip_members WHERE trip_id = ? ORDER BY id').all(tripId) as any[];
  const members = await Promise.all(memberRows.map(rowToMember));
  const my = user ? members.find(m => m.userId === user.id) : null;
  const days = await db().prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').all(tripId) as any[];
  const activities = await db().prepare('SELECT * FROM activities WHERE trip_id = ? ORDER BY day_id, sort, id').all(tripId) as any[];
  const expenses = await db().prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY date DESC, id DESC').all(tripId) as any[];
  const packing = await db().prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY id').all(tripId) as any[];
  const journal = await db().prepare('SELECT * FROM journal_notes WHERE trip_id = ? ORDER BY created_at DESC').all(tripId) as any[];
  const feedRows = await db().prepare('SELECT * FROM activity_log WHERE trip_id = ? ORDER BY id DESC LIMIT 60').all(tripId) as any[];
  const invites = my && ROLE_RANK[my.role] >= ROLE_RANK.admin
    ? (await db().prepare('SELECT * FROM invites WHERE trip_id = ? AND revoked = 0 ORDER BY id DESC').all(tripId) as any[]).map(rowToInvite)
    : [];

  const dayList: TripDay[] = days.map(r => ({ id: r.id, tripId: r.trip_id, dayNumber: r.day_number, date: r.date, title: r.title || '', place: r.place || '' }));
  const actList: Activity[] = activities.map(r => ({
    id: r.id, dayId: r.day_id, tripId: r.trip_id, sort: r.sort, time: r.time, endTime: r.end_time,
    kind: r.kind, title: r.title, place: r.place || '', lat: r.lat, lng: r.lng, cost: r.cost,
    notes: r.notes || '', assigneeId: r.assignee_id, createdAt: r.created_at,
  }));
  const expList: Expense[] = expenses.map(r => ({
    id: r.id, tripId: r.trip_id, payerMemberId: r.payer_member_id, amount: r.amount, category: r.category,
    title: r.title, date: r.date, splitMode: r.split_mode, participants: JSON.parse(r.participants || '[]'), createdAt: r.created_at,
  }));
  const budget = calcBudget(expList, members);

  return {
    trip,
    myRole: my?.role || 'viewer',
    myMemberId: my?.id || 0,
    members,
    invites,
    days: dayList,
    activities: actList,
    expenses: expList,
    budget,
    packing: packing.map(r => ({ id: r.id, tripId: r.trip_id, category: r.category, title: r.title, done: !!r.done, assigneeMemberId: r.assignee_member_id, quantity: r.quantity, note: r.note || '', createdAt: r.created_at })),
    journal: journal.map(r => {
      const author = members.find(m => m.id === r.author_member_id);
      return {
        id: r.id, tripId: r.trip_id, dayId: r.day_id, authorMemberId: r.author_member_id,
        content: r.content, mood: r.mood, createdAt: r.created_at, updatedAt: r.updated_at,
        author: author ? { nickname: author.displayName, avatarColor: author.avatarColor } : null,
      };
    }),
    feed: feedRows.map(r => ({ id: r.id, tripId: r.trip_id, memberName: r.member_name, avatarColor: r.avatar_color, action: r.action, detail: r.detail, createdAt: r.created_at })),
    weather: [],
    onlineMemberIds: onlineMemberIds(tripId).filter(uid => members.some(m => m.userId === uid)),
  };
}

function rowToInvite(r: any): Invite {
  return {
    id: r.id, tripId: r.trip_id, code: r.code, createdBy: r.created_by, maxUses: r.max_uses,
    uses: r.uses, expiresAt: r.expires_at, revoked: !!r.revoked, createdAt: r.created_at,
  };
}

/* ------------------------- 打包清单模板 ------------------------- */

export const PACKING_TEMPLATES: Record<string, { name: string; emoji: string; items: [string, string][] }> = {
  basic: {
    name: '国内经典游', emoji: '🧳',
    items: [
      ['证件', '身份证'], ['证件', '手机里的电子证件备份'], ['证件', '学生证 / 优惠证件'],
      ['衣物', '换洗衣物 3 套'], ['衣物', '外套（早晚温差）'], ['衣物', '舒适的运动鞋'], ['衣物', '睡衣'],
      ['电子', '手机充电器'], ['电子', '充电宝（≤2万毫安）'], ['电子', '耳机'], ['电子', '插线板（多人出行）'],
      ['洗护', '牙刷 / 洗漱包'], ['洗护', '防晒霜'], ['洗护', '纸巾 / 湿巾'], ['洗护', '毛巾'],
      ['药品', '肠胃药'], ['药品', '感冒灵'], ['药品', '创可贴'], ['药品', '晕车药'],
      ['其他', '保温杯'], ['其他', '雨伞'], ['其他', '少量现金'], ['其他', '购物袋（脏衣服）'],
    ],
  },
  beach: {
    name: '海岛度假', emoji: '🏝️',
    items: [
      ['证件', '身份证'], ['证件', '机票 / 船票电子单'],
      ['衣物', '泳衣 ×2'], ['衣物', '沙滩裤 / 沙滩裙'], ['衣物', '防晒衣'], ['衣物', '人字拖'], ['衣物', '遮阳帽'],
      ['电子', '手机防水袋'], ['电子', '充电宝'], ['电子', 'GoPro / 运动相机'],
      ['洗护', '防晒霜 SPF50+'], ['洗护', '晒后修复芦荟胶'], ['洗护', '洗发水（海水后）'],
      ['药品', '晕船药'], ['药品', '防蚊液'], ['药品', '藿香正气水'],
      ['其他', '浮潜面罩'], ['其他', '速干浴巾'], ['其他', '密封袋（手机/湿衣）'],
    ],
  },
  hiking: {
    name: '徒步登山', emoji: '🥾',
    items: [
      ['证件', '身份证'], ['证件', '景区预约截图'],
      ['衣物', '冲锋衣（防风防雨）'], ['衣物', '速干衣裤'], ['衣物', '抓绒 / 羽绒（山顶冷）'], ['衣物', '登山鞋'], ['衣物', '登山杖'], ['衣物', '手套 / 护膝'],
      ['电子', '头灯 / 手电'], ['电子', '充电宝'], ['电子', '离线地图'],
      ['洗护', '防晒霜'], ['洗护', '唇膏'],
      ['药品', '红景天（高海拔）'], ['药品', '氧气瓶（高海拔）'], ['药品', '肌肉贴 / 云南白药'], ['药品', '葡萄糖'],
      ['其他', '登山包'], ['其他', '水袋 / 运动水壶'], ['其他', '能量棒 / 士力架'], ['其他', '一次性雨衣'],
    ],
  },
  citywalk: {
    name: '城市漫游', emoji: '☕',
    items: [
      ['证件', '身份证'], ['衣物', '出片穿搭'], ['衣物', '舒适的鞋（暴走 2 万步）'],
      ['电子', '充电宝'], ['电子', '相机'],
      ['洗护', '补妆包'], ['洗护', '纸巾'],
      ['药品', '创可贴（磨脚）'],
      ['其他', '帆布包'], ['其他', '保温杯'], ['其他', '预约 / 排队截图'],
    ],
  },
  parent: {
    name: '亲子出游', emoji: '🍼',
    items: [
      ['证件', '身份证（娃也要带）'], ['证件', '出生证明 / 户口本（坐飞机）'],
      ['衣物', '娃的换洗衣物（多备 2 套）'], ['衣物', '小被子（车上用）'],
      ['电子', '平板（路上哄娃）'], ['电子', '耳机'],
      ['洗护', '儿童牙刷'], ['洗护', '湿巾大量'], ['洗护', '防晒（儿童款）'],
      ['药品', '退烧药'], ['药品', '体温计'], ['药品', '防蚊液'],
      ['其他', '零食包'], ['其他', '小玩具 / 贴纸书'], ['其他', '水杯'], ['其他', '婴儿车（小龄）'],
    ],
  },
  winter: {
    name: '冰雪旅行', emoji: '⛷️',
    items: [
      ['证件', '身份证'], ['衣物', '加厚羽绒服'], ['衣物', '毛衣 / 抓绒'], ['衣物', '保暖内衣'], ['衣物', '雪地靴'], ['衣物', '帽子围巾手套'], ['衣物', '暖宝宝 ×10'],
      ['电子', '充电宝（低温掉电快）'], ['电子', '相机备用电池'],
      ['洗护', '保湿霜'], ['洗护', '润唇膏'],
      ['药品', '感冒药'], ['药品', '冻疮膏'],
      ['其他', '墨镜（雪地反光）'], ['其他', '保温杯'],
    ],
  },
};

/* ------------------------- 路由表 ------------------------- */

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, user: SessionUser | null, body: any) => Promise<void> | void;

interface Route { method: string; re: RegExp; auth: boolean; handler: Handler }

const routes: Route[] = [];
function route(method: string, pattern: string, auth: boolean, handler: Handler): void {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method, re, auth, handler });
}

/* ======== 认证 ======== */

route('POST', '/api/auth/register', false, async (_req, res, _p, _u, body) => {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim() || username;
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw new ApiError(400, '用户名需为 3-24 位字母、数字或下划线');
  if (password.length < 6) throw new ApiError(400, '密码至少 6 位');
  const exists = await db().prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) throw new ApiError(409, '用户名已被占用');
  const travelId = await allocateTravelId();
  const r = await db().prepare('INSERT INTO users (travel_id, username, password_hash, nickname, avatar_color, bio, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(travelId, username, hashPassword(password), nickname, '#2f6e4f', '', nowISO());
  const userId = Number(r.lastInsertRowid);
  const token = await createSession(userId);
  setAuthCookie(res, token);
  json(res, 200, { token, user: { id: userId, travelId, username, nickname, avatarColor: '#2f6e4f', bio: '' } });
});

route('POST', '/api/auth/login', false, async (_req, res, _p, _u, body) => {
  const username = String(body.username || '').trim().toLowerCase();
  const user = await db().prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
    throw new ApiError(401, '用户名或密码错误');
  }
  const token = await createSession(user.id);
  setAuthCookie(res, token);
  json(res, 200, {
    token,
    user: { id: user.id, travelId: user.travel_id, username: user.username, nickname: user.nickname, avatarColor: user.avatar_color, bio: user.bio },
  });
});

route('POST', '/api/auth/logout', false, async (req, res) => {
  const t = tokenFromRequest(req);
  if (t) await destroySession(t);
  clearAuthCookie(res);
  json(res, 200, { ok: true });
});

route('GET', '/api/me', true, async (_req, res, _p, user) => {
  json(res, 200, { ...user, createdAt: nowISO() });
});

route('PATCH', '/api/me', true, async (_req, res, _p, user, body) => {
  const nickname = body.nickname != null ? String(body.nickname).trim().slice(0, 20) : user.nickname;
  const avatarColor = body.avatarColor != null ? String(body.avatarColor).slice(0, 20) : user.avatarColor;
  const bio = body.bio != null ? String(body.bio).slice(0, 120) : user.bio;
  await db().prepare('UPDATE users SET nickname = ?, avatar_color = ?, bio = ? WHERE id = ?').run(nickname || user.nickname, avatarColor, bio, user.id);
  if (body.newPassword) {
    if (String(body.newPassword).length < 6) throw new ApiError(400, '新密码至少 6 位');
    const row = await db().prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as any;
    if (!verifyPassword(String(body.oldPassword || ''), row.password_hash)) throw new ApiError(400, '原密码不正确');
    await db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(body.newPassword)), user.id);
  }
  json(res, 200, { id: user.id, travelId: user.travelId, username: user.username, nickname: nickname || user.nickname, avatarColor, bio });
});

/* ======== 旅程 ======== */

route('GET', '/api/trips', true, async (_req, res, _p, user) => {
  const rows = await db().prepare(
    `SELECT t.*, tm.role AS my_role FROM trips t JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ? ORDER BY t.start_date ASC`
  ).all(user.id) as any[];
  const trips = [];
  for (const r of rows) {
    const trip = rowToTrip(r);
    const mems = await db().prepare('SELECT display_name, avatar_color, user_id FROM trip_members WHERE trip_id = ? ORDER BY id').all(trip.id) as any[];
    const spent = await db().prepare('SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE trip_id = ?').get(trip.id) as any;
    const actCount = await db().prepare('SELECT COUNT(*) AS c FROM activities WHERE trip_id = ?').get(trip.id) as any;
    trips.push({
      ...trip,
      myRole: r.my_role,
      memberPreview: mems.map(m => ({ displayName: m.display_name, avatarColor: m.avatar_color, userId: m.user_id })),
      totalSpent: Number(spent.s),
      activityCount: Number(actCount.c),
    });
  }
  json(res, 200, trips);
});

route('POST', '/api/trips', true, async (_req, res, _p, user, body) => {
  const title = String(body.title || '').trim().slice(0, 60) || '未命名旅程';
  const destination = String(body.destination || '').trim().slice(0, 60);
  const description = String(body.description || '').slice(0, 600);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(body.startDate || '') ? body.startDate : todayStr();
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(body.endDate || '') && body.endDate >= startDate ? body.endDate : startDate;
  const coverEmoji = String(body.coverEmoji || '🧭').slice(0, 8);
  const coverColor = String(body.coverColor || '#2f6e4f').slice(0, 20);
  const budget = Math.max(0, Number(body.budget) || 0);
  const now = nowISO();
  const r = await db().prepare('INSERT INTO trips (owner_id, title, destination, description, start_date, end_date, cover_emoji, cover_color, budget, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(user.id, title, destination, description, startDate, endDate, coverEmoji, coverColor, budget, now, now);
  const tripId = Number(r.lastInsertRowid);
  await db().prepare('INSERT INTO trip_members (trip_id, user_id, role, display_name, avatar_color, joined_at) VALUES (?,?,?,?,?,?)')
    .run(tripId, user.id, 'owner', user.nickname, user.avatarColor, now);
  const trip = await requireTrip(tripId);
  await syncDays(trip);
  const me = (await memberOf(tripId, user.id))!
  await logActivity(tripId, me, '创建了旅程', title);
  notify(tripId, 'trip', 'create', me.id);
  json(res, 200, { id: tripId });
});

route('GET', '/api/trips/:id', true, async (_req, res, p, user) => {
  await requireMember(Number(p.id), user);
  json(res, 200, await tripBundle(Number(p.id), user));
});

route('PATCH', '/api/trips/:id', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'admin');
  const trip = await requireTrip(tripId);
  const fields: string[] = [];
  const vals: any[] = [];
  const map: Record<string, string> = {
    title: 'title', destination: 'destination', description: 'description', startDate: 'start_date',
    endDate: 'end_date', coverEmoji: 'cover_emoji', coverColor: 'cover_color', budget: 'budget',
  };
  for (const [k, col] of Object.entries(map)) {
    if (body[k] != null) {
      let v = body[k];
      if (k === 'budget') v = Math.max(0, Number(v) || 0);
      if (k === 'description') v = String(v).slice(0, 600);
      if (k === 'title') v = String(v).trim().slice(0, 60) || trip.title;
      fields.push(`${col} = ?`);
      vals.push(v);
    }
  }
  if (fields.length) {
    fields.push('updated_at = ?');
    vals.push(nowISO());
    vals.push(tripId);
    await db().prepare(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  const updated = await requireTrip(tripId);
  const days = await syncDays(updated);
  await logActivity(tripId, me, '更新了旅程信息', updated.title);
  notify(tripId, 'trip', 'update', me.id);
  json(res, 200, { ok: true, days });
});

route('DELETE', '/api/trips/:id', true, async (_req, res, p, user) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user, 'owner');
  await db().prepare('DELETE FROM trips WHERE id = ?').run(tripId);
  json(res, 200, { ok: true });
});

route('POST', '/api/trips/:id/transfer', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user, 'owner');
  const target = await db().prepare('SELECT * FROM trip_members WHERE id = ? AND trip_id = ?').get(Number(body.memberId), tripId) as any;
  if (!target) throw new ApiError(404, '目标成员不存在');
  await db().prepare("UPDATE trips SET owner_id = ? WHERE id = ?").run(target.user_id, tripId);
  await db().prepare("UPDATE trip_members SET role = 'owner' WHERE id = ?").run(target.id);
  await db().prepare("UPDATE trip_members SET role = 'admin' WHERE user_id = ? AND trip_id = ?").run(user.id, tripId);
  const me = (await memberOf(tripId, user.id))!
  await logActivity(tripId, me, '转让了发起人', `新的发起人：${target.display_name}`);
  notify(tripId, 'member', 'transfer', me.id);
  json(res, 200, { ok: true });
});

route('POST', '/api/trips/:id/share', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'admin');
  if (body.enable === false) {
    await db().prepare("UPDATE trips SET share_token = NULL, visibility = 'private', updated_at = ? WHERE id = ?").run(nowISO(), tripId);
  } else {
    const token = randomCode(12);
    await db().prepare("UPDATE trips SET share_token = ?, visibility = 'link', updated_at = ? WHERE id = ?").run(token, nowISO(), tripId);
    await logActivity(tripId, me, '开启了分享链接', '任何人可通过链接只读访问');
  }
  notify(tripId, 'trip', 'share', me.id);
  json(res, 200, { shareToken: (await requireTrip(tripId)).shareToken });
});

/* ======== 成员 ======== */

route('GET', '/api/trips/:id/members', true, async (_req, res, p, user) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user);
  const rows = await db().prepare('SELECT * FROM trip_members WHERE trip_id = ? ORDER BY id').all(tripId) as any[];
  json(res, 200, await Promise.all(rows.map(rowToMember)));
});

route('POST', '/api/trips/:id/members', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'admin');
  await requireTrip(tripId);
  const online = onlineMemberIds(tripId);
  let created: TripMember;
  if (body.travelId) {
    const target = await db().prepare('SELECT * FROM users WHERE travel_id = ?').get(Number(body.travelId)) as any;
    if (!target) throw new ApiError(404, '没有找到该旅行 ID 对应的用户');
    const dup = await db().prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, target.id);
    if (dup) throw new ApiError(409, '对方已经在旅程中');
    const r = await db().prepare('INSERT INTO trip_members (trip_id, user_id, role, display_name, avatar_color, joined_at) VALUES (?,?,?,?,?,?)')
      .run(tripId, target.id, 'editor', target.nickname, target.avatar_color, nowISO());
    created = await rowToMember(await db().prepare('SELECT * FROM trip_members WHERE id = ?').get(Number(r.lastInsertRowid)) as any);
  } else {
    const displayName = String(body.displayName || '').trim().slice(0, 20);
    if (!displayName) throw new ApiError(400, '请填写成员名称');
    const color = String(body.avatarColor || '#8a6d3b');
    const r = await db().prepare('INSERT INTO trip_members (trip_id, user_id, role, display_name, avatar_color, joined_at) VALUES (?,?,?,?,?,?)')
      .run(tripId, null, 'editor', displayName, color, nowISO());
    created = await rowToMember(await db().prepare('SELECT * FROM trip_members WHERE id = ?').get(Number(r.lastInsertRowid)) as any);
  }
  await logActivity(tripId, me, '添加了成员', created.displayName);
  notify(tripId, 'member', 'add', me.id);
  json(res, 200, created);
});

route('PATCH', '/api/trips/:id/members/:mid', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'admin');
  const target = await db().prepare('SELECT * FROM trip_members WHERE id = ? AND trip_id = ?').get(Number(p.mid), tripId) as any;
  if (!target) throw new ApiError(404, '成员不存在');
  if (target.role === 'owner' && body.role && body.role !== 'owner') throw new ApiError(400, '发起人角色不可直接修改，请使用转让');
  if (body.role != null && ROLE_RANK[body.role as MemberRole] >= ROLE_RANK[me.role] && me.role !== 'owner') {
    throw new ApiError(403, '只能授予低于自己等级的角色');
  }
  const role = body.role != null ? body.role : target.role;
  const displayName = body.displayName != null ? String(body.displayName).trim().slice(0, 20) || target.display_name : target.display_name;
  await db().prepare('UPDATE trip_members SET role = ?, display_name = ? WHERE id = ?').run(role, displayName, target.id);
  notify(tripId, 'member', 'update', me.id);
  json(res, 200, await rowToMember(await db().prepare('SELECT * FROM trip_members WHERE id = ?').get(target.id) as any));
});

route('DELETE', '/api/trips/:id/members/:mid', true, async (_req, res, p, user) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'admin');
  const target = await db().prepare('SELECT * FROM trip_members WHERE id = ? AND trip_id = ?').get(Number(p.mid), tripId) as any;
  if (!target) throw new ApiError(404, '成员不存在');
  if (target.role === 'owner') throw new ApiError(400, '发起人不能被移除');
  await db().prepare('DELETE FROM trip_members WHERE id = ?').run(target.id);
  await logActivity(tripId, me, '移除了成员', target.display_name);
  notify(tripId, 'member', 'remove', me.id);
  json(res, 200, { ok: true });
});

route('POST', '/api/trips/:id/location', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user);
  await db().prepare('UPDATE trip_members SET location_lat = ?, location_lng = ?, location = ?, location_at = ? WHERE trip_id = ? AND user_id = ?')
    .run(Number(body.lat) || null, Number(body.lng) || null, String(body.city || '').slice(0, 80) || null, nowISO(), tripId, user.id);
  notify(tripId, 'member', 'location', (await memberOf(tripId, user.id))?.id || 0);
  json(res, 200, { ok: true });
});

/* ======== 邀请 ======== */

route('GET', '/api/trips/:id/invites', true, async (_req, res, p, user) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user, 'admin');
  const rows = await db().prepare('SELECT * FROM invites WHERE trip_id = ? AND revoked = 0 ORDER BY id DESC').all(tripId) as any[];
  json(res, 200, rows.map(rowToInvite));
});

route('POST', '/api/trips/:id/invites', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'admin');
  const maxUses = Math.max(0, Number(body.maxUses) || 0);
  const expiresDays = Math.min(30, Math.max(0, Number(body.expiresDays) || 0));
  const expiresAt = expiresDays > 0 ? new Date(Date.now() + expiresDays * 86400000).toISOString() : null;
  let code = randomCode(8);
  while (await db().prepare('SELECT 1 FROM invites WHERE code = ?').get(code)) code = randomCode(8);
  const r = await db().prepare('INSERT INTO invites (trip_id, code, created_by, max_uses, uses, expires_at, revoked, created_at) VALUES (?,?,?,?,0,?,0,?)')
    .run(tripId, code, user.id, maxUses, expiresAt, nowISO());
  await logActivity(tripId, me, '创建了邀请', `邀请码 ${code}`);
  notify(tripId, 'invite', 'create', me.id);
  json(res, 200, rowToInvite(await db().prepare('SELECT * FROM invites WHERE id = ?').get(Number(r.lastInsertRowid)) as any));
});

route('DELETE', '/api/invites/:id', true, async (_req, res, p, user) => {
  const inv = await db().prepare('SELECT * FROM invites WHERE id = ?').get(Number(p.id)) as any;
  if (!inv) throw new ApiError(404, '邀请不存在');
  await requireMember(Number(inv.trip_id), user, 'admin');
  await db().prepare('UPDATE invites SET revoked = 1 WHERE id = ?').run(inv.id);
  notify(Number(inv.trip_id), 'invite', 'revoke', (await memberOf(Number(inv.trip_id), user.id))?.id || 0);
  json(res, 200, { ok: true });
});

route('GET', '/api/invites/:code', false, async (_req, res, p) => {
  const inv = await db().prepare('SELECT * FROM invites WHERE code = ? AND revoked = 0').get(String(p.code)) as any;
  if (!inv) throw new ApiError(404, '邀请不存在或已失效');
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) throw new ApiError(410, '邀请已过期');
  if (inv.max_uses > 0 && inv.uses >= inv.max_uses) throw new ApiError(410, '邀请次数已用完');
  const trip = await requireTrip(Number(inv.trip_id));
  const members = await db().prepare('SELECT display_name, avatar_color FROM trip_members WHERE trip_id = ? ORDER BY id').all(trip.id) as any[];
  json(res, 200, {
    trip: { id: trip.id, title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, coverEmoji: trip.coverEmoji, coverColor: trip.coverColor },
    inviter: (await db().prepare('SELECT nickname FROM users WHERE id = ?').get(inv.created_by) as any)?.nickname || '旅伴',
    members: members.map(m => ({ displayName: m.display_name, avatarColor: m.avatar_color })),
    memberCount: members.length,
  });
});

route('POST', '/api/invites/:code/join', true, async (_req, res, p, user) => {
  const inv = await db().prepare('SELECT * FROM invites WHERE code = ? AND revoked = 0').get(String(p.code)) as any;
  if (!inv) throw new ApiError(404, '邀请不存在或已失效');
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) throw new ApiError(410, '邀请已过期');
  if (inv.max_uses > 0 && inv.uses >= inv.max_uses) throw new ApiError(410, '邀请次数已用完');
  const tripId = Number(inv.trip_id);
  const dup = await db().prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, user.id);
  if (!dup) {
    // 若已有同名占位成员则绑定
    const placeholder = await db().prepare('SELECT * FROM trip_members WHERE trip_id = ? AND user_id IS NULL AND display_name = ?').get(tripId, user.nickname) as any;
    if (placeholder) {
      await db().prepare('UPDATE trip_members SET user_id = ?, avatar_color = ? WHERE id = ?').run(user.id, user.avatarColor, placeholder.id);
    } else {
      await db().prepare('INSERT INTO trip_members (trip_id, user_id, role, display_name, avatar_color, joined_at) VALUES (?,?,?,?,?,?)')
        .run(tripId, user.id, 'editor', user.nickname, user.avatarColor, nowISO());
    }
    await db().prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?').run(inv.id);
    const me = (await memberOf(tripId, user.id))!
    await logActivity(tripId, me, '加入了旅程', '通过邀请链接');
    notify(tripId, 'member', 'join', me.id);
  }
  json(res, 200, { tripId });
});

/* ======== 天数与行程 ======== */

route('POST', '/api/trips/:id/days', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const trip = await requireTrip(tripId);
  const last = await db().prepare('SELECT MAX(day_number) AS m, MAX(date) AS d FROM days WHERE trip_id = ?').get(tripId) as any;
  const nextNum = Number(last.m || 0) + 1;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : addDays(last.d || trip.startDate, 1);
  const r = await db().prepare('INSERT INTO days (trip_id, day_number, date, title, place) VALUES (?,?,?,?,?)')
    .run(tripId, nextNum, date, String(body.title || '').slice(0, 40), String(body.place || trip.destination || '').slice(0, 40));
  await logActivity(tripId, me, '新增了行程日', String(body.title || `第 ${nextNum} 天`));
  notify(tripId, 'day', 'create', me.id);
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route('PATCH', '/api/days/:id', true, async (_req, res, p, user, body) => {
  const day = await db().prepare('SELECT * FROM days WHERE id = ?').get(Number(p.id)) as any;
  if (!day) throw new ApiError(404, '行程日不存在');
  const me = await requireMember(Number(day.trip_id), user, 'editor');
  const title = body.title != null ? String(body.title).slice(0, 40) : day.title;
  const place = body.place != null ? String(body.place).slice(0, 40) : day.place;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : day.date;
  await db().prepare('UPDATE days SET title = ?, place = ?, date = ? WHERE id = ?').run(title, place, date, day.id);
  await logActivity(Number(day.trip_id), me, '更新了行程日', title || date);
  notify(Number(day.trip_id), 'day', 'update', me.id);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/days/:id', true, async (_req, res, p, user) => {
  const day = await db().prepare('SELECT * FROM days WHERE id = ?').get(Number(p.id)) as any;
  if (!day) throw new ApiError(404, '行程日不存在');
  const me = await requireMember(Number(day.trip_id), user, 'admin');
  await db().prepare('DELETE FROM activities WHERE day_id = ?').run(day.id);
  await db().prepare('DELETE FROM days WHERE id = ?').run(day.id);
  await logActivity(Number(day.trip_id), me, '删除了行程日', day.title || day.date);
  notify(Number(day.trip_id), 'day', 'delete', me.id);
  json(res, 200, { ok: true });
});

route('POST', '/api/days/:id/activities', true, async (_req, res, p, user, body) => {
  const day = await db().prepare('SELECT * FROM days WHERE id = ?').get(Number(p.id)) as any;
  if (!day) throw new ApiError(404, '行程日不存在');
  const me = await requireMember(Number(day.trip_id), user, 'editor');
  const title = String(body.title || '').trim().slice(0, 100);
  if (!title) throw new ApiError(400, '请填写行程内容');
  const maxSort = await db().prepare('SELECT MAX(sort) AS m FROM activities WHERE day_id = ?').get(day.id) as any;
  const time = /^([01]?\d|2[0-3])[:：][0-5]\d$/.test(String(body.time || '')) ? String(body.time).replace('：', ':') : null;
  const lat = body.lat != null && isFinite(Number(body.lat)) ? Number(body.lat) : null;
  const lng = body.lng != null && isFinite(Number(body.lng)) ? Number(body.lng) : null;
  const r = await db().prepare('INSERT INTO activities (trip_id, day_id, sort, time, end_time, kind, title, place, lat, lng, cost, notes, assignee_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(day.trip_id, day.id, Number(maxSort.m || 0) + 1, time, null, String(body.kind || 'sight'), title,
      String(body.place || '').slice(0, 60), lat, lng, Math.max(0, Number(body.cost) || 0),
      String(body.notes || '').slice(0, 300), body.assigneeId != null ? Number(body.assigneeId) : null, nowISO());
  await logActivity(Number(day.trip_id), me, '添加了行程', title);
  notify(Number(day.trip_id), 'activity', 'create', me.id);
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route('PATCH', '/api/activities/:id', true, async (_req, res, p, user, body) => {
  const act = await db().prepare('SELECT * FROM activities WHERE id = ?').get(Number(p.id)) as any;
  if (!act) throw new ApiError(404, '行程不存在');
  const me = await requireMember(Number(act.trip_id), user, 'editor');
  const time = body.time !== undefined ? (/^([01]?\d|2[0-3])[:：][0-5]\d$/.test(String(body.time || '')) ? String(body.time).replace('：', ':') : null) : act.time;
  const title = body.title != null ? String(body.title).trim().slice(0, 100) || act.title : act.title;
  const kind = body.kind != null ? String(body.kind) : act.kind;
  const place = body.place != null ? String(body.place).slice(0, 60) : act.place;
  const cost = body.cost != null ? Math.max(0, Number(body.cost) || 0) : act.cost;
  const notes = body.notes != null ? String(body.notes).slice(0, 300) : act.notes;
  const lat = body.lat !== undefined ? (isFinite(Number(body.lat)) && body.lat !== null ? Number(body.lat) : null) : act.lat;
  const lng = body.lng !== undefined ? (isFinite(Number(body.lng)) && body.lng !== null ? Number(body.lng) : null) : act.lng;
  const assigneeId = body.assigneeId !== undefined ? (body.assigneeId === null ? null : Number(body.assigneeId)) : act.assignee_id;
  const dayId = body.dayId != null ? Number(body.dayId) : act.day_id;
  const sort = body.sort != null ? Number(body.sort) : act.sort;
  await db().prepare('UPDATE activities SET time=?, title=?, kind=?, place=?, cost=?, notes=?, lat=?, lng=?, assignee_id=?, day_id=?, sort=? WHERE id = ?')
    .run(time, title, kind, place, cost, notes, lat, lng, assigneeId, dayId, sort, act.id);
  await logActivity(Number(act.trip_id), me, '更新了行程', title);
  notify(Number(act.trip_id), 'activity', 'update', me.id);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/activities/:id', true, async (_req, res, p, user) => {
  const act = await db().prepare('SELECT * FROM activities WHERE id = ?').get(Number(p.id)) as any;
  if (!act) throw new ApiError(404, '行程不存在');
  const me = await requireMember(Number(act.trip_id), user, 'editor');
  await db().prepare('DELETE FROM activities WHERE id = ?').run(act.id);
  await logActivity(Number(act.trip_id), me, '删除了行程', act.title);
  notify(Number(act.trip_id), 'activity', 'delete', me.id);
  json(res, 200, { ok: true });
});

route('POST', '/api/trips/:id/activities/reorder', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const items = Array.isArray(body.items) ? body.items : [];
  const upd = await db().prepare('UPDATE activities SET day_id = ?, sort = ? WHERE id = ? AND trip_id = ?');
  for (const it of items) {
    if (it.id != null && it.dayId != null && it.sort != null) await upd.run(Number(it.dayId), Number(it.sort), Number(it.id), tripId);
  }
  notify(tripId, 'activity', 'reorder', me.id);
  json(res, 200, { ok: true });
});

/* ======== POI 搜索 ======== */

route('GET', '/api/poi/search', true, async (req, res, _p, _user) => {
  const url = new URL(req.url || '', 'http://localhost');
  const q = url.searchParams.get('q') || '';
  const city = url.searchParams.get('city') || '';
  json(res, 200, await searchPois(q, city));
});

/* ======== 记账 ======== */

route('POST', '/api/trips/:id/expenses', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const amount = Number(body.amount);
  if (!isFinite(amount) || amount <= 0) throw new ApiError(400, '请填写正确的金额');
  const title = String(body.title || '').trim().slice(0, 60) || '未命名支出';
  const payerMemberId = Number(body.payerMemberId) || me.id;
  const r = await db().prepare('INSERT INTO expenses (trip_id, payer_member_id, amount, category, title, date, split_mode, participants, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(tripId, payerMemberId, amount, String(body.category || '其他'), title,
      /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayStr(),
      body.splitMode === 'payer' ? 'payer' : 'equal', JSON.stringify(Array.isArray(body.participants) ? body.participants : []), user.id, nowISO());
  await logActivity(tripId, me, '记了一笔账', `${title} ¥${amount}`);
  notify(tripId, 'expense', 'create', me.id);
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route('PATCH', '/api/expenses/:id', true, async (_req, res, p, user, body) => {
  const exp = await db().prepare('SELECT * FROM expenses WHERE id = ?').get(Number(p.id)) as any;
  if (!exp) throw new ApiError(404, '账目不存在');
  const me = await requireMember(Number(exp.trip_id), user, 'editor');
  const amount = body.amount != null ? Math.max(0, Number(body.amount) || 0) : exp.amount;
  const title = body.title != null ? String(body.title).trim().slice(0, 60) || exp.title : exp.title;
  const category = body.category != null ? String(body.category) : exp.category;
  const date = body.date != null && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : exp.date;
  const payerMemberId = body.payerMemberId != null ? Number(body.payerMemberId) : exp.payer_member_id;
  const splitMode = body.splitMode != null ? (body.splitMode === 'payer' ? 'payer' : 'equal') : exp.split_mode;
  const participants = body.participants != null ? JSON.stringify(Array.isArray(body.participants) ? body.participants : []) : exp.participants;
  await db().prepare('UPDATE expenses SET amount=?, title=?, category=?, date=?, payer_member_id=?, split_mode=?, participants=? WHERE id=?')
    .run(amount, title, category, date, payerMemberId, splitMode, participants, exp.id);
  notify(Number(exp.trip_id), 'expense', 'update', me.id);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/expenses/:id', true, async (_req, res, p, user) => {
  const exp = await db().prepare('SELECT * FROM expenses WHERE id = ?').get(Number(p.id)) as any;
  if (!exp) throw new ApiError(404, '账目不存在');
  const me = await requireMember(Number(exp.trip_id), user, 'editor');
  await db().prepare('DELETE FROM expenses WHERE id = ?').run(exp.id);
  await logActivity(Number(exp.trip_id), me, '删除了账目', exp.title);
  notify(Number(exp.trip_id), 'expense', 'delete', me.id);
  json(res, 200, { ok: true });
});

/* ======== 打包清单 ======== */

route('POST', '/api/trips/:id/packing', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const ins = await db().prepare('INSERT INTO packing_items (trip_id, category, title, done, assignee_member_id, quantity, note, created_at) VALUES (?,?,?,0,?,?,?,?)');
  const ids: number[] = [];
  if (Array.isArray(body.items)) {
    for (const it of body.items.slice(0, 80)) {
      const title = String(it.title || '').trim().slice(0, 60);
      if (!title) continue;
      const r = await ins.run(tripId, String(it.category || '其他'), title, it.assigneeMemberId != null ? Number(it.assigneeMemberId) : null,
        Math.max(1, Number(it.quantity) || 1), String(it.note || '').slice(0, 100), nowISO());
      ids.push(Number(r.lastInsertRowid));
    }
  } else {
    const title = String(body.title || '').trim().slice(0, 60);
    if (!title) throw new ApiError(400, '请填写物品名称');
    const r = await ins.run(tripId, String(body.category || '其他'), title, body.assigneeMemberId != null ? Number(body.assigneeMemberId) : null,
      Math.max(1, Number(body.quantity) || 1), String(body.note || '').slice(0, 100), nowISO());
    ids.push(Number(r.lastInsertRowid));
  }
  await logActivity(tripId, me, '添加了打包物品', `${ids.length} 件`);
  notify(tripId, 'packing', 'create', me.id);
  json(res, 200, { ids });
});

route('POST', '/api/trips/:id/packing/template', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const tpl = PACKING_TEMPLATES[String(body.template || 'basic')];
  if (!tpl) throw new ApiError(400, '模板不存在');
  const ins = await db().prepare('INSERT INTO packing_items (trip_id, category, title, done, assignee_member_id, quantity, note, created_at) VALUES (?,?,?,0,NULL,1,?,?)');
  const existing = new Set((await db().prepare('SELECT title FROM packing_items WHERE trip_id = ?').all(tripId) as any[]).map(r => r.title));
  let n = 0;
  for (const [cat, title] of tpl.items) {
    if (existing.has(title)) continue;
    await ins.run(tripId, cat, title, '', nowISO());
    n++;
  }
  await logActivity(tripId, me, '导入打包模板', `${tpl.name} · ${n} 件`);
  notify(tripId, 'packing', 'template', me.id);
  json(res, 200, { added: n });
});

route('PATCH', '/api/packing/:id', true, async (_req, res, p, user, body) => {
  const item = await db().prepare('SELECT * FROM packing_items WHERE id = ?').get(Number(p.id)) as any;
  if (!item) throw new ApiError(404, '物品不存在');
  const me = await requireMember(Number(item.trip_id), user, 'editor');
  const done = body.done != null ? (body.done ? 1 : 0) : item.done;
  const title = body.title != null ? String(body.title).trim().slice(0, 60) || item.title : item.title;
  const category = body.category != null ? String(body.category) : item.category;
  const assigneeMemberId = body.assigneeMemberId !== undefined ? (body.assigneeMemberId === null ? null : Number(body.assigneeMemberId)) : item.assignee_member_id;
  const note = body.note != null ? String(body.note).slice(0, 100) : item.note;
  const quantity = body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : item.quantity;
  await db().prepare('UPDATE packing_items SET done=?, title=?, category=?, assignee_member_id=?, note=?, quantity=? WHERE id=?')
    .run(done, title, category, assigneeMemberId, note, quantity, item.id);
  notify(Number(item.trip_id), 'packing', 'update', me.id);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/packing/:id', true, async (_req, res, p, user) => {
  const item = await db().prepare('SELECT * FROM packing_items WHERE id = ?').get(Number(p.id)) as any;
  if (!item) throw new ApiError(404, '物品不存在');
  const me = await requireMember(Number(item.trip_id), user, 'editor');
  await db().prepare('DELETE FROM packing_items WHERE id = ?').run(item.id);
  notify(Number(item.trip_id), 'packing', 'delete', me.id);
  json(res, 200, { ok: true });
});

/* ======== 旅行日志 ======== */

route('POST', '/api/trips/:id/journal', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const content = String(body.content || '').trim().slice(0, 3000);
  if (!content) throw new ApiError(400, '写点什么再发布吧');
  const dayId = body.dayId != null && Number(body.dayId) > 0 ? Number(body.dayId) : null;
  const mood = String(body.mood || '🙂').slice(0, 8);
  const r = await db().prepare('INSERT INTO journal_notes (trip_id, day_id, author_member_id, content, mood, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(tripId, dayId, me.id, content, mood, nowISO(), nowISO());
  await logActivity(tripId, me, '写了旅行日志', content.slice(0, 20) + '…');
  notify(tripId, 'journal', 'create', me.id);
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route('PATCH', '/api/journal/:id', true, async (_req, res, p, user, body) => {
  const note = await db().prepare('SELECT * FROM journal_notes WHERE id = ?').get(Number(p.id)) as any;
  if (!note) throw new ApiError(404, '日志不存在');
  const me = await requireMember(Number(note.trip_id), user, 'editor');
  if (note.author_member_id !== me.id && ROLE_RANK[me.role] < ROLE_RANK.admin) throw new ApiError(403, '只能编辑自己的日志');
  const content = body.content != null ? String(body.content).trim().slice(0, 3000) || note.content : note.content;
  const mood = body.mood != null ? String(body.mood).slice(0, 8) : note.mood;
  await db().prepare('UPDATE journal_notes SET content = ?, mood = ?, updated_at = ? WHERE id = ?').run(content, mood, nowISO(), note.id);
  notify(Number(note.trip_id), 'journal', 'update', me.id);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/journal/:id', true, async (_req, res, p, user) => {
  const note = await db().prepare('SELECT * FROM journal_notes WHERE id = ?').get(Number(p.id)) as any;
  if (!note) throw new ApiError(404, '日志不存在');
  const me = await requireMember(Number(note.trip_id), user, 'editor');
  if (note.author_member_id !== me.id && ROLE_RANK[me.role] < ROLE_RANK.admin) throw new ApiError(403, '只能删除自己的日志');
  await db().prepare('DELETE FROM journal_notes WHERE id = ?').run(note.id);
  notify(Number(note.trip_id), 'journal', 'delete', me.id);
  json(res, 200, { ok: true });
});

/* ======== 旅行锦囊 ======== */

function rowToGuide(r: any): GuideCard {
  return {
    id: r.id, tripId: r.trip_id, category: r.category, icon: r.icon,
    title: r.title, summary: r.summary, items: JSON.parse(r.items || '[]'),
    source: r.source, sort: r.sort,
  };
}

function parseGuideItems(items: any): { label?: string; text: string }[] {
  return (Array.isArray(items) ? items : [])
    .map((it: any) => typeof it === 'string'
      ? { text: String(it).slice(0, 200) }
      : { label: it?.label ? String(it.label).slice(0, 40) : undefined, text: String(it?.text || '').slice(0, 200) })
    .filter((it: any) => it.text)
    .slice(0, 10);
}

route('GET', '/api/trips/:id/handbook', true, async (_req, res, p, user) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user);
  const rows = await db().prepare('SELECT * FROM guide_cards WHERE trip_id = ? ORDER BY sort, id').all(tripId) as any[];
  json(res, 200, rows.map(rowToGuide));
});

route('POST', '/api/trips/:id/handbook', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const title = String(body.title || '').trim().slice(0, 30);
  if (!title) throw new ApiError(400, '请填写卡片标题');
  const items = parseGuideItems(body.items);
  if (!items.length) throw new ApiError(400, '请至少写一条内容');
  const cat = ['food', 'tip', 'phrase', 'photo'].includes(body.category) ? body.category : 'tip';
  const maxSort = await db().prepare("SELECT COALESCE(MAX(sort),999) AS m FROM guide_cards WHERE trip_id = ? AND source = 'custom'").get(tripId) as any;
  const r = await db().prepare('INSERT INTO guide_cards (trip_id, category, icon, title, summary, items, source, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(tripId, cat, String(body.icon || '📌').slice(0, 4), title, String(body.summary || '').slice(0, 120),
      JSON.stringify(items), 'custom', Number(maxSort.m) + 1, nowISO());
  await logActivity(tripId, me, '添加了锦囊卡片', title);
  notify(tripId, 'handbook', 'create', me.id);
  json(res, 200, rowToGuide(await db().prepare('SELECT * FROM guide_cards WHERE id = ?').get(Number(r.lastInsertRowid)) as any));
});

route('POST', '/api/trips/:id/handbook/generate', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const trip = await requireTrip(tripId);
  const interests = Array.isArray(body.interests) ? body.interests.map(String).slice(0, 6) : [];
  const dayCount = await db().prepare('SELECT COUNT(*) AS c FROM days WHERE trip_id = ?').get(tripId) as any;
  let cards = await aiHandbook(trip.destination, Number(dayCount.c) || 3, interests);
  let source: GuideCard['source'] = 'ai';
  if (!cards) {
    cards = buildHandbook(trip.destination);
    source = 'builtin';
  }
  // 重新生成只替换 builtin/ai 卡片，成员自定义的 custom 卡保留
  await db().prepare("DELETE FROM guide_cards WHERE trip_id = ? AND source != 'custom'").run(tripId);
  const ins = await db().prepare('INSERT INTO guide_cards (trip_id, category, icon, title, summary, items, source, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    await ins.run(tripId, c.category, c.icon, c.title, c.summary, JSON.stringify(c.items), source, i, nowISO());
  }
  // 自定义卡固定排在生成卡之后
  await db().prepare("UPDATE guide_cards SET sort = ? + id * 10 WHERE trip_id = ? AND source = 'custom'").run(cards.length, tripId);
  await logActivity(tripId, me, source === 'ai' ? '用 AI 生成了旅行锦囊' : '生成了旅行锦囊', `${cards.length} 张卡片`);
  notify(tripId, 'handbook', 'generate', me.id);
  const rows = await db().prepare('SELECT * FROM guide_cards WHERE trip_id = ? ORDER BY sort, id').all(tripId) as any[];
  json(res, 200, rows.map(rowToGuide));
});

route('DELETE', '/api/handbook/:id', true, async (_req, res, p, user) => {
  const card = await db().prepare('SELECT * FROM guide_cards WHERE id = ?').get(Number(p.id)) as any;
  if (!card) throw new ApiError(404, '卡片不存在');
  const me = await requireMember(Number(card.trip_id), user, 'editor');
  await db().prepare('DELETE FROM guide_cards WHERE id = ?').run(card.id);
  notify(Number(card.trip_id), 'handbook', 'delete', me.id);
  json(res, 200, { ok: true });
});

/* ======== 使用助手 ======== */

route('POST', '/api/assistant', true, async (_req, res, _p, user, body) => {
  const history = sanitizeHistory(body.messages);
  const { reply, source } = await answerUsageQuestion(history);
  json(res, 200, { reply, source });
});

/* ======== AI ======== */

route('GET', '/api/ai/status', true, async (_req, res) => {
  json(res, 200, { enabled: aiConfigured() });
});

route('POST', '/api/trips/:id/ai/parse-guide', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user, 'editor');
  const text = String(body.text || '');
  if (!text.trim()) throw new ApiError(400, '请粘贴攻略文本');
  json(res, 200, await parseGuide(text));
});

route('POST', '/api/trips/:id/ai/generate', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user, 'editor');
  const city = String(body.city || '').trim().slice(0, 40);
  if (!city) throw new ApiError(400, '请填写目的地');
  json(res, 200, await generatePlan({
    city,
    days: Number(body.days) || 3,
    pace: body.pace,
    interests: Array.isArray(body.interests) ? body.interests.map(String).slice(0, 6) : [],
  }));
});

route('POST', '/api/trips/:id/ai/apply', true, async (_req, res, p, user, body) => {
  const tripId = Number(p.id);
  const me = await requireMember(tripId, user, 'editor');
  const guide = body.guide as ParsedGuide;
  if (!guide?.days?.length) throw new ApiError(400, '行程数据为空');
  const trip = await requireTrip(tripId);
  const replace = body.replaceDays !== false;
  if (replace) {
    await db().prepare('DELETE FROM activities WHERE trip_id = ?').run(tripId);
    await db().prepare('DELETE FROM days WHERE trip_id = ?').run(tripId);
  }
  let baseNum = replace ? 0 : (await db().prepare('SELECT MAX(day_number) AS m FROM days WHERE trip_id = ?').get(tripId) as any).m || 0;
  const insDay = await db().prepare('INSERT INTO days (trip_id, day_number, date, title, place) VALUES (?,?,?,?,?)');
  const insAct = await db().prepare('INSERT INTO activities (trip_id, day_id, sort, time, kind, title, place, lat, lng, cost, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  let actCount = 0;
  for (const gd of guide.days) {
    baseNum += 1;
    const date = gd.dayNumber && !replace ? addDays(trip.startDate, baseNum - 1) : addDays(trip.startDate, baseNum - 1);
    const r = await insDay.run(tripId, baseNum, date, String(gd.title || '').slice(0, 40), String(gd.place || trip.destination || '').slice(0, 40));
    const dayId = Number(r.lastInsertRowid);
    let sort = 0;
    for (const ga of gd.activities || []) {
      const title = String(ga.title || '').trim().slice(0, 100);
      if (!title) continue;
      await insAct.run(tripId, dayId, sort++, ga.time ? String(ga.time).replace('：', ':').slice(0, 5) : null,
        String(ga.kind || 'sight'), title, String(ga.place || gd.place || '').slice(0, 60), null, null, 0,
        String(ga.notes || '').slice(0, 200), nowISO());
      actCount++;
    }
  }
  await logActivity(tripId, me, '用 AI 生成了行程', `${guide.days.length} 天 · ${actCount} 项安排`);
  notify(tripId, 'day', 'ai-apply', me.id);
  json(res, 200, { ok: true, days: guide.days.length, activities: actCount });
});

/* ======== 天气 ======== */

route('GET', '/api/trips/:id/weather', true, async (_req, res, p, user) => {
  const tripId = Number(p.id);
  await requireMember(tripId, user);
  const days = await db().prepare('SELECT date, place FROM days WHERE trip_id = ? ORDER BY day_number').all(tripId) as any[];
  if (!days.length) {
    json(res, 200, []);
    return;
  }
  // 取出现频率最高的地点代表整段行程的天气窗口
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d.place || '', (counts.get(d.place || '') || 0) + 1);
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] || '';
  const dates = days.map(d => d.date);
  json(res, 200, await getWeather(main, dates));
});

/* ======== 公开分享 ======== */

route('GET', '/api/share/:token', false, async (_req, res, p) => {
  const trip = await db().prepare('SELECT * FROM trips WHERE share_token = ?').get(String(p.token)) as any;
  if (!trip) throw new ApiError(404, '分享链接不存在或已关闭');
  const bundle = await tripBundle(Number(trip.id), null);
  json(res, 200, {
    trip: bundle.trip,
    days: bundle.days,
    activities: bundle.activities,
    members: bundle.members.map(m => ({ displayName: m.displayName, avatarColor: m.avatarColor, role: m.role })),
    journal: bundle.journal,
    weather: bundle.weather,
  });
});

/* ======== 查找用户（按旅行 ID） ======== */

route('GET', '/api/users/search', true, async (req, res, _p, _user) => {
  const url = new URL(req.url || '', 'http://localhost');
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    json(res, 200, []);
    return;
  }
  const rows = await db().prepare('SELECT id, travel_id, username, nickname, avatar_color FROM users WHERE travel_id = ? OR username = ? OR nickname = ? LIMIT 5')
    .all(Number(q) || -1, q, q) as any[];
  json(res, 200, rows.map(r => ({ id: r.id, travelId: r.travel_id, username: r.username, nickname: r.nickname, avatarColor: r.avatar_color })));
});

/* ------------------------- 分发 ------------------------- */

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = url.match(r.re);
    if (!m) continue;
    try {
      const user = await requireAuthSafe(req);
      if (r.auth && !user) throw new ApiError(401, '请先登录');
      const body = method === 'POST' || method === 'PATCH' || method === 'PUT' ? await readBody(req) : {};
      await r.handler(req, res, m.groups || {}, user, body);
    } catch (e: any) {
      if (e instanceof ApiError) {
        json(res, e.status, { error: e.message });
      } else {
        console.error('[api]', method, url, e);
        json(res, 500, { error: '服务器开小差了，请稍后再试' });
      }
    }
    return true;
  }
  return false;
}

async function requireAuthSafe(req: IncomingMessage): Promise<SessionUser | null> {
  return await getUserByToken(tokenFromRequest(req));
}
