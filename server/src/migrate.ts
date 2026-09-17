/* ============================================================
 * 一次性数据迁移引擎：PocketBay PostgreSQL → 微信云托管 MySQL
 *
 * 通道设计（两侧数据库都不对公网开放直连，经应用层搬运）：
 *  - 导出：PocketBay 部署一个临时版本，带令牌守护的
 *      GET /api/admin/migrate/dump?token=<令牌>
 *    （令牌文件 server/src/admin-migrate-token.txt，gitignore 排除，
 *     文件不存在时接口一律 404，常规构建天然关闭）
 *  - 导入：在云托管容器内（控制台 Webshell）执行：
 *      cd /app
 *      curl -s '< PocketBay >/api/admin/migrate/script?token=<令牌>' -o migrate.ts
 *      node migrate.ts '< PocketBay >/api/admin/migrate/dump?token=<令牌>'
 *    或对已部署带本文件的版本 POST /api/admin/migrate/import。
 *
 * 合并策略（保真 + 保云侧账号）：
 *  - dump 数据原样落库：显式保留 id / 密码哈希 / 时间戳，行程关系不断链；
 *  - 两边各自种子出的演示数据（demo/xiaofang/ashu、种子旅程）以 PocketBay 版本为准；
 *  - 云托管独有用户（wx_<openid> 静默注册的微信账号）及其名下旅程、成员、
 *    记账等整体保留，id 平移到两侧最大 id 之上的高位段，引用同步重写
 *    （含 expenses.participants 里的成员 id 数组）；
 *  - journal images / avatar 引用的 /uploads/ 图片从 PocketBay 拉取并内联为
 *    dataURL——云托管文件系统是临时的，且小程序无法访问对方静态文件；
 *    预算控制内联体积（callContainer 单次响应上限 1MiB）。
 *  - 导入前把目标库全表备份为 server/data/migrate-backup-<时间戳>.json。
 *
 * 本文件必须可在 Node ≥ 22.18（类型剥离）下独立运行：不 import 项目内模块，
 * 引擎通过 adapter 注入数据库访问。
 * ============================================================ */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------------- 表结构描述（与 db.ts 三方言 DDL 对齐；sessions 不迁移） ---------------- */

export const MIGRATE_TABLES = [
  'users', 'trips', 'trip_members', 'invites', 'days', 'activities', 'expenses',
  'packing_items', 'journal_notes', 'activity_log', 'guide_cards', 'travel_links', 'flywhere_watch',
] as const;
export type MigrateTable = (typeof MIGRATE_TABLES)[number];

/** 插入顺序：父表在前（外键依赖）；删除顺序为其反序 */
const COLUMNS: Record<MigrateTable, string[]> = {
  users: ['id', 'travel_id', 'username', 'password_hash', 'nickname', 'avatar_color', 'bio', 'wechat_openid', 'avatar_url', 'created_at'],
  trips: ['id', 'owner_id', 'title', 'destination', 'description', 'start_date', 'end_date', 'cover_emoji', 'cover_color', 'budget', 'visibility', 'share_token', 'created_at', 'updated_at'],
  trip_members: ['id', 'trip_id', 'user_id', 'role', 'display_name', 'avatar_color', 'location', 'location_lat', 'location_lng', 'location_at', 'joined_at'],
  invites: ['id', 'trip_id', 'code', 'created_by', 'max_uses', 'uses', 'expires_at', 'revoked', 'created_at'],
  days: ['id', 'trip_id', 'day_number', 'date', 'title', 'place'],
  activities: ['id', 'trip_id', 'day_id', 'sort', 'time', 'end_time', 'kind', 'title', 'place', 'lat', 'lng', 'cost', 'notes', 'assignee_id', 'created_at'],
  expenses: ['id', 'trip_id', 'payer_member_id', 'amount', 'category', 'title', 'date', 'split_mode', 'participants', 'created_by', 'created_at'],
  packing_items: ['id', 'trip_id', 'category', 'title', 'done', 'assignee_member_id', 'quantity', 'note', 'created_at'],
  journal_notes: ['id', 'trip_id', 'day_id', 'author_member_id', 'content', 'mood', 'images', 'created_at', 'updated_at'],
  activity_log: ['id', 'trip_id', 'user_id', 'member_name', 'avatar_color', 'action', 'detail', 'created_at'],
  guide_cards: ['id', 'trip_id', 'category', 'icon', 'title', 'summary', 'items', 'source', 'sort', 'created_at'],
  travel_links: ['id', 'trip_id', 'type', 'title', 'url', 'note', 'created_by', 'created_at'],
  flywhere_watch: ['id', 'route_key', 'city', 'min_per_person', 'checked_at'],
};

/** MySQL VARCHAR 列宽（字符数）——导入前按码点截断，MySQL 严格模式拒收超长值 */
const VARCHAR_LIMITS: Record<string, number> = {
  'users.username': 64, 'users.password_hash': 128, 'users.nickname': 64,
  'users.avatar_color': 16, 'users.bio': 512, 'users.wechat_openid': 64, 'users.created_at': 32,
  'trips.title': 128, 'trips.destination': 128, 'trips.description': 512,
  'trips.start_date': 16, 'trips.end_date': 16, 'trips.cover_emoji': 8, 'trips.cover_color': 16,
  'trips.visibility': 16, 'trips.share_token': 64, 'trips.created_at': 32, 'trips.updated_at': 32,
  'trip_members.role': 16, 'trip_members.display_name': 64, 'trip_members.avatar_color': 16,
  'trip_members.location': 128, 'trip_members.location_at': 32, 'trip_members.joined_at': 32,
  'invites.code': 32, 'invites.expires_at': 32, 'invites.created_at': 32,
  'days.date': 16, 'days.title': 128, 'days.place': 128,
  'activities.time': 8, 'activities.end_time': 8, 'activities.kind': 16, 'activities.title': 128,
  'activities.place': 128, 'activities.created_at': 32,
  'expenses.category': 16, 'expenses.title': 128, 'expenses.date': 16, 'expenses.split_mode': 16,
  'expenses.created_at': 32,
  'packing_items.category': 16, 'packing_items.title': 128, 'packing_items.note': 256, 'packing_items.created_at': 32,
  'journal_notes.mood': 8, 'journal_notes.created_at': 32, 'journal_notes.updated_at': 32,
  'activity_log.member_name': 64, 'activity_log.avatar_color': 16, 'activity_log.action': 64,
  'activity_log.detail': 256, 'activity_log.created_at': 32,
  'guide_cards.category': 16, 'guide_cards.icon': 8, 'guide_cards.title': 128, 'guide_cards.summary': 512,
  'guide_cards.source': 16, 'guide_cards.created_at': 32,
  'travel_links.type': 16, 'travel_links.title': 128, 'travel_links.url': 512, 'travel_links.note': 256,
  'travel_links.created_at': 32,
  'flywhere_watch.route_key': 128, 'flywhere_watch.city': 64, 'flywhere_watch.checked_at': 32,
};

/** PG 布尔列（true/false）→ MySQL TINYINT */
const BOOL_COLS = new Set(['invites.revoked', 'packing_items.done']);

/** 历史数据用 0 表示「未指派」（且成员删除不清理指派引用）——统一归一为 NULL */
const NULL_ON_ZERO = new Set(['packing_items.assignee_member_id', 'activities.assignee_id']);

/** 缺列时的默认值（dump 来自 SELECT *，正常都有；仅防御旧行缺列） */
const COL_DEFAULTS: Record<string, any> = {
  'users.avatar_color': '#2f6e4f', 'users.bio': '', 'users.nickname': '',
  'trips.destination': '', 'trips.description': '', 'trips.cover_emoji': '🧭', 'trips.cover_color': '#2f6e4f',
  'trips.budget': 0, 'trips.visibility': 'private',
  'trip_members.role': 'editor', 'trip_members.avatar_color': '#8a6d3b',
  'invites.max_uses': 0, 'invites.uses': 0, 'invites.revoked': 0,
  'activities.sort': 0, 'activities.kind': 'sight', 'activities.place': '', 'activities.cost': 0, 'activities.notes': '',
  'expenses.category': '其他', 'expenses.split_mode': 'equal', 'expenses.participants': '[]',
  'packing_items.category': '其他', 'packing_items.done': 0, 'packing_items.quantity': 1, 'packing_items.note': '',
  'journal_notes.mood': '🙂', 'journal_notes.images': '[]',
  'activity_log.avatar_color': '#2f6e4f', 'activity_log.detail': '',
  'guide_cards.category': 'tip', 'guide_cards.icon': '📌', 'guide_cards.summary': '', 'guide_cards.items': '[]',
  'guide_cards.source': 'builtin', 'guide_cards.sort': 0,
  'travel_links.type': 'web', 'travel_links.note': '',
};

/* ---------------- 通用类型与工具 ---------------- */

export interface DbAdapter {
  rows: (sql: string, params?: any[]) => Promise<any[]>;
  exec: (sql: string, params?: any[]) => Promise<void>;
  /** mysql=支持 ALTER ... AUTO_INCREMENT；其它驱动跳过该步 */
  driver: 'sqlite' | 'postgres' | 'mysql';
}

export interface DumpData { driver?: string; exportedAt?: string; tables: Record<string, any[]> }

export interface ImportReport {
  backupFile: string;
  dryRun: boolean;
  images: { inlined: number; skipped: number; bytes: number };
  perTable: { table: string; dump: number; preservedCloud: number; droppedCloud: number; final: number }[];
  warnings: string[];
}

const ids = (rows: any[]): number[] => rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
const maxId = (rows: any[]): number => (rows.length ? Math.max(...ids(rows)) : 0);

/** 按码点截断（MySQL VARCHAR 按字符计，emoji 是 1 个字符而非 JS 的 2 个单元） */
function clipByCodePoints(v: string, limit: number): string {
  const cps = Array.from(v);
  return cps.length <= limit ? v : cps.slice(0, limit).join('');
}

/** 单行规范化：补缺列、布尔转 0/1、undefined→null、超长截断（记 warning） */
function normalizeRow(table: MigrateTable, row: any, warn: string[], label: string): any {
  const out: any = {};
  for (const col of COLUMNS[table]) {
    let v = row[col];
    if (v === undefined || v === null) v = table === 'users' && col === 'avatar_url' ? null : (COL_DEFAULTS[`${table}.${col}`] ?? null);
    if (typeof v === 'boolean' || BOOL_COLS.has(`${table}.${col}`)) v = v ? 1 : 0;
    if (v === 0 && NULL_ON_ZERO.has(`${table}.${col}`)) v = null;
    const lim = VARCHAR_LIMITS[`${table}.${col}`];
    if (typeof v === 'string' && lim) {
      const clipped = clipByCodePoints(v, lim);
      if (clipped !== v) {
        warn.push(`${label} 列 ${col} 超 MySQL 列宽（${Array.from(v).length}→${lim} 字符），已截断`);
        v = clipped;
      }
    }
    out[col] = v === undefined ? null : v;
  }
  return out;
}

/* ---------------- 合并规划（纯函数） ---------------- */

export interface ImportPlan {
  inserts: Record<string, any[]>;
  perTable: { table: string; dump: number; preservedCloud: number; droppedCloud: number }[];
  warnings: string[];
}

/**
 * dump 行原样保留（显式 id）；云侧独有数据（wx_ 用户名下）平移保留。
 * cloud 为目标库当前全表行。任何引用断链直接抛错（导入前拦截，不写半截数据）。
 */
export function planImport(dump: DumpData, cloud: Record<string, any[]>): ImportPlan {
  const warn: string[] = [];
  const D = dump.tables;
  const stat: ImportPlan['perTable'] = [];

  /* --- users：PB 原样 + 云侧独有用户平移 --- */
  const dumpUserNames = new Set(D.users.map((u) => String(u.username)));
  let nextUserId = Math.max(maxId(D.users), maxId(cloud.users));
  let nextTravelId = Math.max(100000,
    ...D.users.map((u) => Number(u.travel_id) || 0),
    ...cloud.users.map((u) => Number(u.travel_id) || 0));
  const userMap = new Map<number, number>(); // 云侧旧 user id → 新 id（仅独有用户）
  const users = D.users.map((u) => normalizeRow('users', u, warn, `users#${u.id}`));
  let preservedUsers = 0;
  for (const cu of cloud.users) {
    if (dumpUserNames.has(String(cu.username))) continue; // 同名（种子）账号以 PocketBay 为准
    const newId = ++nextUserId;
    userMap.set(Number(cu.id), newId);
    const row = normalizeRow('users', cu, warn, `cloud-users#${cu.id}`);
    row.id = newId;
    row.travel_id = ++nextTravelId; // travel_id 唯一，平移到两侧最大值之上
    users.push(row);
    preservedUsers++;
  }
  const mapUser = (uid: any): number | null => {
    if (uid === null || uid === undefined) return null;
    const n = Number(uid);
    return userMap.has(n) ? userMap.get(n)! : n; // 未平移 = PB 保留 id，原样
  };
  const userIds = new Set(users.map((u) => u.id));
  const userNames = new Set(users.map((u) => String(u.username)));
  if (users.length !== userNames.size) throw new Error('users.username 合并后存在重复');
  const travelIds = users.map((u) => Number(u.travel_id));
  if (new Set(travelIds).size !== travelIds.length) throw new Error('users.travel_id 合并后存在重复');

  /* --- trips：云侧独有用户名下的旅程保留（id 一律平移——云侧新建旅程 id 几乎必然
   *     与 PocketBay 旅程 id 相撞，如两边各自的 2/3/4 号）；被替换账号（种子）名下旅程丢弃 --- */
  const preservedUserIds = new Set(userMap.keys());
  let nextTripId = Math.max(maxId(D.trips), maxId(cloud.trips));
  const tripMap = new Map<number, number>();
  const trips = D.trips.map((t) => normalizeRow('trips', t, warn, `trips#${t.id}`));
  let preservedTrips = 0;
  for (const ct of cloud.trips) {
    if (!preservedUserIds.has(Number(ct.owner_id))) continue; // 种子/被替换账号名下：以 PocketBay 为准
    const newId = ++nextTripId;
    tripMap.set(Number(ct.id), newId);
    const row = normalizeRow('trips', ct, warn, `cloud-trips#${ct.id}`);
    row.id = newId;
    row.owner_id = mapUser(ct.owner_id);
    trips.push(row);
    preservedTrips++;
  }
  const tripIds = new Set(trips.map((t) => t.id));

  /* --- trip_members --- */
  let nextMemberId = Math.max(maxId(D.trip_members), maxId(cloud.trip_members));
  const memberMap = new Map<number, number>();
  const members = D.trip_members.map((m) => normalizeRow('trip_members', m, warn, `trip_members#${m.id}`));
  let preservedMembers = 0;
  let droppedMembers = 0;
  for (const cm of cloud.trip_members) {
    if (!tripMap.has(Number(cm.trip_id))) { droppedMembers++; continue; } // 属于被替换的种子旅程
    const newId = ++nextMemberId;
    memberMap.set(Number(cm.id), newId);
    const row = normalizeRow('trip_members', cm, warn, `cloud-trip_members#${cm.id}`);
    row.id = newId;
    row.trip_id = tripMap.get(Number(cm.trip_id))!;
    row.user_id = mapUser(cm.user_id);
    members.push(row);
    preservedMembers++;
  }
  const memberIds = new Set(members.map((m) => m.id));
  const memberUniq = new Set(members.filter((m) => m.user_id !== null).map((m) => `${m.trip_id}:${m.user_id}`));
  if (memberUniq.size !== members.filter((m) => m.user_id !== null).length) {
    throw new Error('trip_members.(trip_id,user_id) 合并后存在重复');
  }
  const mapMember = (mid: any): number | null => {
    if (mid === null || mid === undefined) return null;
    const n = Number(mid);
    return memberMap.has(n) ? memberMap.get(n)! : n;
  };
  const keptMemberIds = new Set(members.map((m) => m.id)); // participants 剔除悬空 id 的依据

  /* --- days（activities/journal 外键引用，先规划） --- */
  let nextDayId = Math.max(maxId(D.days), maxId(cloud.days));
  const dayMap = new Map<number, number>();
  const days = D.days.map((r) => normalizeRow('days', r, warn, `days#${r.id}`));
  let preservedDays = 0;
  for (const cd of cloud.days) {
    if (!tripMap.has(Number(cd.trip_id))) continue;
    const newId = ++nextDayId;
    dayMap.set(Number(cd.id), newId);
    const row = normalizeRow('days', cd, warn, `cloud-days#${cd.id}`);
    row.id = newId;
    row.trip_id = tripMap.get(Number(cd.trip_id))!;
    days.push(row);
    preservedDays++;
  }
  const dayIds = new Set(days.map((d) => d.id));
  const mapDay = (did: any): number | null => {
    if (did === null || did === undefined) return null;
    const n = Number(did);
    return dayMap.has(n) ? dayMap.get(n)! : n;
  };

  /* --- 其余子表：PB 原样 + 云侧独有旅程的行平移 --- */
  const preservedCount = new Map<string, number>();
  const droppedCount = new Map<string, number>();
  const childTables: MigrateTable[] = ['invites', 'activities', 'expenses', 'packing_items', 'journal_notes', 'guide_cards', 'travel_links', 'activity_log'];
  const childInserts: Record<string, any[]> = {};
  for (const table of childTables) {
    const rows = D[table].map((r) => normalizeRow(table, r, warn, `${table}#${r.id}`));
    let nextChildId = Math.max(maxId(D[table]), maxId(cloud[table] || []));
    let p = 0;
    let dropped = 0;
    for (const cr of cloud[table] || []) {
      if (!tripMap.has(Number(cr.trip_id))) { dropped++; continue; }
      const row = normalizeRow(table, cr, warn, `cloud-${table}#${cr.id}`);
      row.id = ++nextChildId;
      row.trip_id = tripMap.get(Number(cr.trip_id))!;
      if (table === 'invites') row.created_by = mapUser(cr.created_by);
      if (table === 'activities') { row.day_id = mapDay(cr.day_id); row.assignee_id = mapMember(cr.assignee_id); }
      if (table === 'expenses') {
        row.payer_member_id = mapMember(cr.payer_member_id);
        row.created_by = mapUser(cr.created_by);
        row.participants = remapParticipants(cr.participants, memberMap, keptMemberIds, warn, `cloud-expenses#${cr.id}`);
      }
      if (table === 'packing_items') row.assignee_member_id = mapMember(cr.assignee_member_id);
      if (table === 'journal_notes') { row.day_id = mapDay(cr.day_id); row.author_member_id = mapMember(cr.author_member_id); }
      if (table === 'travel_links') row.created_by = mapUser(cr.created_by);
      if (table === 'activity_log') row.user_id = mapUser(cr.user_id);
      rows.push(row);
      p++;
    }
    preservedCount.set(table, p);
    droppedCount.set(table, dropped);
    childInserts[table] = rows;
  }

  /* --- flywhere_watch：价格记忆以 PocketBay 历史为准（云侧 1 天测试数据丢弃） --- */
  const watch = D.flywhere_watch.map((r) => normalizeRow('flywhere_watch', r, warn, `flywhere_watch#${r.id}`));

  const inserts: Record<string, any[]> = {
    users, trips, trip_members: members, days,
    invites: childInserts.invites, activities: childInserts.activities, expenses: childInserts.expenses,
    packing_items: childInserts.packing_items, journal_notes: childInserts.journal_notes,
    guide_cards: childInserts.guide_cards, travel_links: childInserts.travel_links,
    activity_log: childInserts.activity_log, flywhere_watch: watch,
  };

  stat.push({ table: 'users', dump: D.users.length, preservedCloud: preservedUsers, droppedCloud: cloud.users.length - preservedUsers });
  stat.push({ table: 'trips', dump: D.trips.length, preservedCloud: preservedTrips, droppedCloud: cloud.trips.length - preservedTrips });
  stat.push({ table: 'trip_members', dump: D.trip_members.length, preservedCloud: preservedMembers, droppedCloud: droppedMembers });
  stat.push({ table: 'days', dump: D.days.length, preservedCloud: preservedDays, droppedCloud: cloud.days.length - preservedDays });
  for (const t of childTables) stat.push({ table: t, dump: D[t].length, preservedCloud: preservedCount.get(t)!, droppedCloud: droppedCount.get(t)! });
  stat.push({ table: 'flywhere_watch', dump: D.flywhere_watch.length, preservedCloud: 0, droppedCloud: (cloud.flywhere_watch || []).length });

  sanitizeCosmeticRefs(inserts, warn);
  validateInserts(inserts, warn);
  return { inserts, perTable: stat, warnings: warn };
}

/** participants JSON（成员 id 数组）随平移重写；成员随旅程被替换产生的悬空 id 剔除 */
function remapParticipants(raw: any, memberMap: Map<number, number>, keptMemberIds: Set<number>, warn: string[], label: string): string {
  let arr: any[];
  try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  const out: number[] = [];
  for (const id of arr) {
    const n = Number(id);
    if (!Number.isFinite(n)) continue;
    const mapped = memberMap.has(n) ? memberMap.get(n)! : n;
    if (!keptMemberIds.has(mapped)) continue; // 悬空 id：成员已随被替换的旅程丢弃
    out.push(mapped);
  }
  if (out.length !== arr.length) warn.push(`${label} participants 含已不存在的成员 id，已剔除`);
  return JSON.stringify(out);
}

/* ---------------- 引用完整性校验（写库前全量拦截） ---------------- */

/** 装饰性引用（指派/日志挂天）孤儿时置空并告警；结构性引用孤儿直接失败 */
function sanitizeCosmeticRefs(ins: Record<string, any[]>, warn: string[]): void {
  const memberIds = new Set(ins.trip_members.map((r) => r.id));
  const dayIds = new Set(ins.days.map((r) => r.id));
  for (const p of ins.packing_items) {
    if (p.assignee_member_id !== null && !memberIds.has(p.assignee_member_id)) {
      warn.push(`packing_items#${p.id} 指派成员 ${p.assignee_member_id} 已不存在，置空`);
      p.assignee_member_id = null;
    }
  }
  for (const a of ins.activities) {
    if (a.assignee_id !== null && !memberIds.has(a.assignee_id)) {
      warn.push(`activities#${a.id} 指派成员 ${a.assignee_id} 已不存在，置空`);
      a.assignee_id = null;
    }
  }
  for (const j of ins.journal_notes) {
    if (j.day_id !== null && !dayIds.has(j.day_id)) {
      warn.push(`journal_notes#${j.id} 挂靠的行程日 ${j.day_id} 已不存在，置空`);
      j.day_id = null;
    }
  }
}

function validateInserts(ins: Record<string, any[]>, warn: string[]): void {
  const errors: string[] = [];
  const push = (msg: string) => { if (errors.length < 30) errors.push(msg); };

  const userIds = new Set(ins.users.map((r) => r.id));
  const tripIds = new Set(ins.trips.map((r) => r.id));
  const dayIds = new Set(ins.days.map((r) => r.id));
  const memberIds = new Set(ins.trip_members.map((r) => r.id));
  const dayTrip = new Map(ins.days.map((r) => [r.id, r.trip_id]));
  const memberTrip = new Map(ins.trip_members.map((r) => [r.id, r.trip_id]));

  for (const u of ins.users) {
    if (!u.username) push(`users#${u.id} 缺 username`);
    if (!u.password_hash) push(`users#${u.id} 缺 password_hash`);
    if (!u.created_at) push(`users#${u.id} 缺 created_at`);
  }
  for (const t of ins.trips) {
    if (!userIds.has(t.owner_id)) push(`trips#${t.id} owner_id=${t.owner_id} 不在 users`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(t.end_date || '')) push(`trips#${t.id} 日期格式异常`);
    if (!['private', 'link'].includes(t.visibility)) push(`trips#${t.id} visibility=${t.visibility} 非法`);
  }
  const dayUniq = new Set<string>();
  for (const d of ins.days) {
    if (!tripIds.has(d.trip_id)) push(`days#${d.id} trip_id=${d.trip_id} 不在 trips`);
    const k = `${d.trip_id}:${d.day_number}`;
    if (dayUniq.has(k)) push(`days#${d.id} (trip_id,day_number) 重复`);
    dayUniq.add(k);
  }
  for (const m of ins.trip_members) {
    if (!tripIds.has(m.trip_id)) push(`trip_members#${m.id} trip_id=${m.trip_id} 不在 trips`);
    if (m.user_id !== null && !userIds.has(m.user_id)) push(`trip_members#${m.id} user_id=${m.user_id} 不在 users`);
    if (!['viewer', 'editor', 'admin', 'owner'].includes(m.role)) push(`trip_members#${m.id} role=${m.role} 非法`);
  }
  for (const a of ins.activities) {
    if (!tripIds.has(a.trip_id)) push(`activities#${a.id} trip_id 不在 trips`);
    if (!dayIds.has(a.day_id) || dayTrip.get(a.day_id) !== a.trip_id) push(`activities#${a.id} day_id=${a.day_id} 与所属旅程不符`);
    if (!a.title) push(`activities#${a.id} 缺 title`);
  }
  for (const e of ins.expenses) {
    if (!tripIds.has(e.trip_id)) push(`expenses#${e.id} trip_id 不在 trips`);
    // 付款人/参与人可能因成员删除成孤儿（成员删除不清理记账引用）：保留原值仅告警——与 PocketBay 现网行为一致
    if (!memberIds.has(e.payer_member_id)) warn.push(`expenses#${e.id} 付款成员 ${e.payer_member_id} 已不存在（保留原值）`);
    let parts: any[] = [];
    try { parts = JSON.parse(e.participants || '[]'); } catch { parts = []; }
    for (const pid of parts) {
      if (!memberIds.has(Number(pid))) warn.push(`expenses#${e.id} 参与人 ${pid} 已不存在（保留原值）`);
    }
    if (!Number.isFinite(Number(e.amount))) push(`expenses#${e.id} amount 非数值`);
    if (!['equal', 'payer'].includes(e.split_mode)) push(`expenses#${e.id} split_mode=${e.split_mode} 非法`);
  }
  for (const p of ins.packing_items) {
    if (!tripIds.has(p.trip_id)) push(`packing_items#${p.id} trip_id 不在 trips`);
  }
  for (const j of ins.journal_notes) {
    if (!tripIds.has(j.trip_id)) push(`journal_notes#${j.id} trip_id 不在 trips`);
    if (!memberIds.has(j.author_member_id)) warn.push(`journal_notes#${j.id} 作者成员 ${j.author_member_id} 已不存在（保留原值）`);
  }
  for (const g of ins.guide_cards) if (!tripIds.has(g.trip_id)) push(`guide_cards#${g.id} trip_id 不在 trips`);
  for (const l of ins.travel_links) if (!tripIds.has(l.trip_id)) push(`travel_links#${l.id} trip_id 不在 trips`);
  for (const a of ins.activity_log) if (!tripIds.has(a.trip_id)) push(`activity_log#${a.id} trip_id 不在 trips`);
  for (const i of ins.invites) {
    if (!tripIds.has(i.trip_id)) push(`invites#${i.id} trip_id 不在 trips`);
    if (!userIds.has(i.created_by)) push(`invites#${i.id} created_by=${i.created_by} 不在 users`);
  }
  const inviteCodes = new Set<string>();
  for (const i of ins.invites) {
    if (inviteCodes.has(i.code)) push(`invites#${i.id} 邀请码 ${i.code} 重复`);
    inviteCodes.add(i.code);
  }

  if (errors.length) throw new Error(`合并结果引用校验失败（${errors.length} 处，写库已中止）：\n  - ${errors.join('\n  - ')}`);
}

/* ---------------- /uploads 图片内联（小程序无法访问 PocketBay 静态文件） ---------------- */

const IMG_PER_IMAGE_MAX = 400 * 1024;      // 单图拉取上限
const IMG_PER_TRIP_BUDGET = 600_000;       // 每旅程内联 base64 预算（callContainer 单次响应上限 1MiB）
const AVATAR_MAX = 200 * 1024;             // 与 PATCH /api/me 的头像上限一致

async function fetchAsDataUrl(origin: string, uploadPath: string, limit: number): Promise<{ dataUrl: string; bytes: number } | null> {
  try {
    const res = await fetch(`${origin.replace(/\/$/, '')}${uploadPath}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || '').split(';')[0];
    if (!mime.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > limit) return null;
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, bytes: buf.length };
  } catch { return null; }
}

/** 就地把 dump 中 journal images / avatar 的 /uploads/ 引用替换为 dataURL；预算不足保留原路径并记 warning */
export async function inlineUploadImages(dump: DumpData, origin: string, warn: string[]): Promise<ImportReport['images']> {
  const cache = new Map<string, { dataUrl: string; bytes: number } | null>();
  const stat = { inlined: 0, skipped: 0, bytes: 0 };
  const load = async (p: string, limit: number) => {
    if (cache.has(p)) return cache.get(p)!;
    const r = await fetchAsDataUrl(origin, p, limit);
    cache.set(p, r);
    return r;
  };

  // 日志图片：按旅程预算，thumb 优先（小程序缩略图直接可看），full 用剩余预算（网页端灯箱）
  const budget = new Map<number, number>();
  for (const n of dump.tables.journal_notes) {
    let images: any[] = [];
    try { images = JSON.parse(n.images || '[]'); } catch { images = []; }
    if (!images.some((im) => im && typeof im.thumb === 'string' && im.thumb.startsWith('/uploads/'))) continue;
    const tripId = Number(n.trip_id);
    const used = () => budget.get(tripId) || 0;
    for (const pass of ['thumb', 'full'] as const) {
      for (const im of images) {
        if (!im || typeof im[pass] !== 'string' || !im[pass].startsWith('/uploads/')) continue;
        if (im[pass].startsWith('data:')) continue;
        const got = await load(im[pass], IMG_PER_IMAGE_MAX);
        if (!got) { warn.push(`日志#${n.id} 图片 ${im[pass]} 拉取失败，保留原路径`); stat.skipped++; continue; }
        if (used() + got.dataUrl.length > IMG_PER_TRIP_BUDGET) { stat.skipped++; continue; }
        budget.set(tripId, used() + got.dataUrl.length);
        im[pass] = got.dataUrl;
        stat.inlined++;
        stat.bytes += got.bytes;
      }
    }
    n.images = JSON.stringify(images);
  }

  // 头像（PocketBay 网页版如存过 /uploads/ 头像路径）
  for (const u of dump.tables.users) {
    const p = u.avatar_url;
    if (typeof p !== 'string' || !p.startsWith('/uploads/')) continue;
    const got = await fetchAsDataUrl(origin, p, AVATAR_MAX);
    if (got) { u.avatar_url = got.dataUrl; stat.inlined++; stat.bytes += got.bytes; }
    else { warn.push(`用户#${u.id} 头像 ${p} 拉取失败，保留原路径`); stat.skipped++; }
  }
  return stat;
}

/* ---------------- 执行 ---------------- */

export interface ImportOptions {
  dryRun?: boolean;
  pbOrigin?: string;      // 拉取 /uploads 图片用（默认不内联）
  backupDir?: string;     // 备份目录（默认 server/data）
}

export async function runImport(adapter: DbAdapter, dumpInput: DumpData, opts: ImportOptions = {}): Promise<ImportReport> {
  const dump: DumpData = JSON.parse(JSON.stringify(dumpInput)); // 深拷贝，内联改写不影响调用方
  const warn: string[] = [];
  const images = opts.pbOrigin
    ? await inlineUploadImages(dump, opts.pbOrigin, warn)
    : { inlined: 0, skipped: 0, bytes: 0 };

  // 目标库现状（也是导入前备份）
  const cloud: Record<string, any[]> = {};
  for (const t of MIGRATE_TABLES) cloud[t] = await adapter.rows(`SELECT * FROM ${t}`);

  const backupDir = opts.backupDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `migrate-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(backupFile, JSON.stringify({ exportedAt: new Date().toISOString(), tables: cloud }, null, 1), 'utf8');

  const plan = planImport(dump, cloud);

  if (!opts.dryRun) {
    // journal images / avatar 内联为 dataURL 后可能超过 TEXT 64KB——先升为 MEDIUMTEXT。
    // ALTER 在 MySQL 里隐式提交，必须在事务外执行
    if (adapter.driver === 'mysql') {
      for (const ddl of [
        'ALTER TABLE journal_notes MODIFY images MEDIUMTEXT NOT NULL',
        'ALTER TABLE users MODIFY avatar_url MEDIUMTEXT NULL',
      ]) {
        try { await adapter.exec(ddl); } catch (e: any) { warn.push(`列宽升级跳过（${e?.message || e}）`); }
      }
    }
    // 清空 + 写入包在一个事务里：中途失败回滚，不留半截库
    await adapter.exec('START TRANSACTION');
    try {
      // 清空：反依赖序（sessions 不迁移但一并清掉，旧 token 指向的 user 可能已变化）
      for (const t of ['sessions', ...[...MIGRATE_TABLES].reverse()]) {
        await adapter.exec(`DELETE FROM ${t}`);
      }
      // 写入：父表在前
      for (const t of MIGRATE_TABLES) {
        const cols = COLUMNS[t];
        const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        for (const row of plan.inserts[t]) {
          await adapter.exec(sql, cols.map((c) => row[c]));
        }
      }
      await adapter.exec('COMMIT');
    } catch (e) {
      await adapter.exec('ROLLBACK').catch(() => undefined);
      throw e;
    }
    // 自增指针推到最大 id 之后（显式插入不会自动推高 MySQL 的 AUTO_INCREMENT；ALTER 隐式提交，放事务外）
    if (adapter.driver === 'mysql') {
      for (const t of MIGRATE_TABLES) {
        const max = maxId(plan.inserts[t]);
        if (max > 0) await adapter.exec(`ALTER TABLE ${t} AUTO_INCREMENT = ${max + 1}`);
      }
    }
  }

  const perTable: ImportReport['perTable'] = [];
  for (const s of plan.perTable) {
    const final = opts.dryRun ? s.dump + s.preservedCloud : (await adapter.rows(`SELECT COUNT(*) AS c FROM ${s.table}`))[0].c;
    perTable.push({ ...s, final: Number(final) });
  }
  return { backupFile, dryRun: !!opts.dryRun, images, perTable, warnings: [...warn, ...plan.warnings] };
}

/* ---------------- CLI（Webshell / 本地） ---------------- */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const src = argv.find((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  const pbOriginFlag = argv.find((a) => a.startsWith('--pb-origin='));
  if (!src) {
    console.log('用法：node migrate.ts <dump 文件路径或 URL> [--dry-run] [--pb-origin=https://gotrip.pocketbay.app]');
    console.log('  --pb-origin 指定时内联 /uploads 图片为 dataURL（默认取 dump URL 的站点根；本地 dump 文件则不内联）');
    console.log('环境变量：MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD（云托管自动注入）');
    process.exit(1);
  }
  console.log('① 读取 dump…');
  let dump: DumpData;
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`拉取 dump 失败：HTTP ${res.status}`);
    dump = await res.json();
  } else {
    dump = JSON.parse(readFileSync(path.resolve(src), 'utf8'));
  }
  const counts = MIGRATE_TABLES.map((t) => `${t}:${dump.tables[t]?.length ?? 0}`).join(' ');
  console.log(`   源（${dump.driver || '?'}）：${counts}`);

  const mysqlAddr = process.env.MYSQL_ADDRESS || '';
  if (!mysqlAddr) throw new Error('缺少 MYSQL_ADDRESS（应在云托管容器内运行，或本地显式指定）');
  const [host, portStr] = mysqlAddr.split(':');
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host, port: Number(portStr) || 3306,
    user: process.env.MYSQL_USERNAME || '', password: process.env.MYSQL_PASSWORD || '',
    database: 'gotrip', charset: 'utf8mb4', connectionLimit: 2,
  });
  const adapter: DbAdapter = {
    driver: 'mysql',
    rows: async (sql, params = []) => (await pool.query(sql, params))[0] as any[],
    exec: async (sql, params = []) => { await pool.query(sql, params); },
  };
  console.log(dryRun ? '② 试运行（不写库）…' : '② 开始导入（含写库）…');
  const pbOrigin = pbOriginFlag ? pbOriginFlag.slice('--pb-origin='.length) : (/^https?:\/\//.test(src) ? guessOrigin(src) : '');
  const report = await runImport(adapter, dump, { dryRun, pbOrigin });
  console.log(`   备份：${report.backupFile}`);
  console.log(`   图片：内联 ${report.images.inlined} 张（${(report.images.bytes / 1024).toFixed(0)}KB），跳过 ${report.images.skipped}`);
  for (const s of report.perTable) {
    console.log(`   ${s.table.padEnd(14)} dump=${String(s.dump).padStart(4)}  云侧保留=${String(s.preservedCloud).padStart(3)}  云侧丢弃=${String(s.droppedCloud).padStart(3)}  最终=${String(s.final).padStart(4)}`);
  }
  if (report.warnings.length) {
    console.log(`⚠ 警告 ${report.warnings.length} 条：`);
    for (const w of report.warnings.slice(0, 40)) console.log(`   - ${w}`);
  }
  await pool.end();
  console.log(dryRun ? '✓ 试运行完成（未写库）' : '✓ 导入完成');
}

/** dump URL → 站点根（用于拉 /uploads 图片） */
function guessOrigin(src: string): string {
  try { return new URL(src).origin; } catch { return ''; }
}

const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) {
  main().catch((e) => { console.error('✗ 迁移失败：', e?.message || e); console.error(e?.stack || ''); process.exit(1); });
}
