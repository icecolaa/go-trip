import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { nowISO, addDays, todayStr } from './util.ts';
import { hashPassword } from './auth.ts';
import { buildHandbook } from './handbook.ts';

/* ============================================================
 * 数据访问层：双驱动
 *  - 设置 DATABASE_URL 时使用 PocketBay 托管 PostgreSQL（pg Pool，max 5，强制 TLS）
 *  - 未设置时回退本地 SQLite（node:sqlite），本地开发零配置
 * 统一异步 API：db().prepare(sql) → { get, all, run }（均为 Promise），
 * run() 返回 { lastInsertRowid }（PG 通过 INSERT ... RETURNING id 模拟）
 * ============================================================ */

export type DbDriver = 'sqlite' | 'postgres';
let _driver: DbDriver = 'sqlite';
let _sqlite: DatabaseSync | null = null;
let _pg: any = null;

export function dbDriver(): DbDriver { return _driver; }

/** SQLite 占位符 ? → PostgreSQL $1..$n */
function toPgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** 统一的 prepare 句柄：方法异步化，run() 模拟 lastInsertRowid */
interface Stmt {
  get: (...params: any[]) => Promise<any>;
  all: (...params: any[]) => Promise<any[]>;
  run: (...params: any[]) => Promise<{ lastInsertRowid: number; changes?: number }>;
}

export function db(): { prepare: (sql: string) => Stmt } {
  if (_driver === 'postgres') {
    return {
      prepare(sql: string): Stmt {
        const pgSql = toPgSql(sql);
        // sessions 表主键是 token，没有 id 列，不能追加 RETURNING id
        const isInsert = /^\s*insert/i.test(sql) && !/returning/i.test(sql) && !/\binsert\s+into\s+sessions\b/i.test(sql);
        const finalSql = isInsert ? `${pgSql} RETURNING id` : pgSql;
        return {
          async get(...params: any[]) {
            const r = await _pg.query(finalSql, params);
            return r.rows[0];
          },
          async all(...params: any[]) {
            const r = await _pg.query(finalSql, params);
            return r.rows;
          },
          async run(...params: any[]) {
            const r = await _pg.query(finalSql, params);
            return { lastInsertRowid: isInsert ? Number(r.rows[0]?.id) : 0, changes: r.rowCount ?? 0 };
          },
        };
      },
    };
  }
  // SQLite：保持既有语义，套一层 Promise 使调用方写法一致
  const s = _sqlite!;
  return {
    prepare(sql: string): Stmt {
      const stmt = s.prepare(sql);
      return {
        async get(...params: any[]) { return stmt.get(...params); },
        async all(...params: any[]) { return stmt.all(...params); },
        async run(...params: any[]) {
          const r = stmt.run(...params);
          return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
        },
      };
    },
  };
}

/** SQLite 建表 */
function migrateSqlite(d: DatabaseSync): void {
  d.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    travel_id INTEGER UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#2f6e4f',
    bio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    cover_emoji TEXT NOT NULL DEFAULT '🧭',
    cover_color TEXT NOT NULL DEFAULT '#2f6e4f',
    budget REAL NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'private',
    share_token TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trip_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    display_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#8a6d3b',
    location TEXT,
    location_lat REAL,
    location_lng REAL,
    location_at TEXT,
    joined_at TEXT NOT NULL,
    UNIQUE(trip_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 0,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '',
    UNIQUE(trip_id, day_number)
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    time TEXT,
    end_time TEXT,
    kind TEXT NOT NULL DEFAULT 'sight',
    title TEXT NOT NULL,
    place TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    cost REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    assignee_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    payer_member_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT '其他',
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    split_mode TEXT NOT NULL DEFAULT 'equal',
    participants TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS packing_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT '其他',
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    assignee_member_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS journal_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id INTEGER,
    author_member_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    mood TEXT NOT NULL DEFAULT '🙂',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER,
    member_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#2f6e4f',
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guide_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'tip',
    icon TEXT NOT NULL DEFAULT '📌',
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'builtin',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activities_day ON activities(day_id);
  CREATE INDEX IF NOT EXISTS idx_members_trip ON trip_members(trip_id);
  CREATE INDEX IF NOT EXISTS idx_guide_trip ON guide_cards(trip_id);
  `);

  // 旧库平滑升级：缺列补列 + 攻略链接表 + 飞哪儿价格记忆（幂等，可重复执行）
  try { d.exec("ALTER TABLE journal_notes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'"); } catch { /* 已存在 */ }
  d.exec(`
  CREATE TABLE IF NOT EXISTS travel_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'web',
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_links_trip ON travel_links(trip_id);
  CREATE TABLE IF NOT EXISTS flywhere_watch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_key TEXT UNIQUE NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    min_per_person REAL NOT NULL,
    checked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flywhere_compare (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_key TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    min_tax_total REAL NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fwcompare_route ON flywhere_compare(route_key);
  `);
}

/** PostgreSQL 建表（语义与 SQLite 版一致，id 用 GENERATED BY DEFAULT AS IDENTITY 便于显式插入） */
async function migratePg(pg: any): Promise<void> {
  await pg.query(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    travel_id INTEGER UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#2f6e4f',
    bio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    cover_emoji TEXT NOT NULL DEFAULT '🧭',
    cover_color TEXT NOT NULL DEFAULT '#2f6e4f',
    budget REAL NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'private',
    share_token TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trip_members (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    display_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#8a6d3b',
    location TEXT,
    location_lat REAL,
    location_lng REAL,
    location_at TEXT,
    joined_at TEXT NOT NULL,
    UNIQUE(trip_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 0,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS days (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '',
    UNIQUE(trip_id, day_number)
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    time TEXT,
    end_time TEXT,
    kind TEXT NOT NULL DEFAULT 'sight',
    title TEXT NOT NULL,
    place TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    cost REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    assignee_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    payer_member_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT '其他',
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    split_mode TEXT NOT NULL DEFAULT 'equal',
    participants TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS packing_items (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT '其他',
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    assignee_member_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS journal_notes (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id INTEGER,
    author_member_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    mood TEXT NOT NULL DEFAULT '🙂',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER,
    member_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#2f6e4f',
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guide_cards (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'tip',
    icon TEXT NOT NULL DEFAULT '📌',
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'builtin',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activities_day ON activities(day_id);
  CREATE INDEX IF NOT EXISTS idx_members_trip ON trip_members(trip_id);
  CREATE INDEX IF NOT EXISTS idx_guide_trip ON guide_cards(trip_id);
  `);

  // 旧库平滑升级：缺列补列 + 攻略链接表 + 飞哪儿价格记忆（幂等，可重复执行）
  await pg.query("ALTER TABLE journal_notes ADD COLUMN IF NOT EXISTS images TEXT NOT NULL DEFAULT '[]'").catch(() => undefined);
  await pg.query(`
  CREATE TABLE IF NOT EXISTS travel_links (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'web',
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_links_trip ON travel_links(trip_id);
  CREATE TABLE IF NOT EXISTS flywhere_watch (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    route_key TEXT UNIQUE NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    min_per_person REAL NOT NULL,
    checked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flywhere_compare (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    route_key TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    min_tax_total REAL NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fwcompare_route ON flywhere_compare(route_key);
  `);
}

function insertUser(d: { prepare: (sql: string) => Stmt }, travelId: number, username: string, hash: string, nickname: string, color: string, bio: string): Promise<number> {
  return (async () => {
    const r = await d.prepare('INSERT INTO users (travel_id, username, password_hash, nickname, avatar_color, bio, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(travelId, username, hash, nickname, color, bio, nowISO());
    return r.lastInsertRowid;
  })();
}

/** 首次启动写入演示数据，让新部署开箱即有内容可看 */
async function seedDemo(d: { prepare: (sql: string) => Stmt }): Promise<void> {
  const count = await d.prepare('SELECT COUNT(*) AS c FROM users').get() as any;
  if (Number(count.c) > 0) return;

  const pass = hashPassword('demo1234');

  const demoId = await insertUser(d, 100001, 'demo', pass, '演示用户', '#2f6e4f', '热爱山川湖海');
  const linId = await insertUser(d, 100002, 'xiaofang', pass, '小方', '#b5543b', '相机不离手');
  const shuId = await insertUser(d, 100003, 'ashu', pass, '阿树', '#3b6ea5', '攻略整理担当');

  const start = addDays(todayStr(), 10);
  const end = addDays(start, 5);
  const tripId = Number((await d.prepare(
    'INSERT INTO trips (owner_id, title, destination, description, start_date, end_date, cover_emoji, cover_color, budget, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(demoId, '云南大理丽江 · 6日慢游', '大理 → 丽江', '苍山洱海、古镇雪山，一次把云南的松弛感集齐。', start, end, '⛰️', '#2f6e4f', 8000, nowISO(), nowISO())).lastInsertRowid);

  const insMember = d.prepare('INSERT INTO trip_members (trip_id, user_id, role, display_name, avatar_color, joined_at) VALUES (?,?,?,?,?,?)');
  const mDemo = Number((await insMember.run(tripId, demoId, 'owner', '演示用户', '#2f6e4f', nowISO())).lastInsertRowid);
  const mLin = Number((await insMember.run(tripId, linId, 'editor', '小方', '#b5543b', nowISO())).lastInsertRowid);
  const mShu = Number((await insMember.run(tripId, shuId, 'editor', '阿树', '#3b6ea5', nowISO())).lastInsertRowid);

  const insDay = d.prepare('INSERT INTO days (trip_id, day_number, date, title, place) VALUES (?,?,?,?,?)');
  const insAct = d.prepare('INSERT INTO activities (trip_id, day_id, sort, time, kind, title, place, lat, lng, cost, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const dayPlans: [string, string, string, any[][]][] = [
    ['抵达大理 · 古城初见', '大理', [
      ['14:00', 'transport', '昆明长水机场 ✈ 大理', '大理机场', 25.647, 100.321, 400, '提前值机，选靠右侧窗户看苍山'],
      ['16:30', 'hotel', '入住古城民宿', '大理古城', 25.693, 100.164, 688, '订了带院子的房间，可晾衣服'],
      ['18:00', 'food', '古城内吃白族菜', '人民路', 25.694, 100.163, 120, '推荐：砂锅鱼、乳扇、雕梅酒'],
      ['19:30', 'sight', '大理古城夜逛', '复兴路', 25.693, 100.162, 0, '五华楼夜景，买点鲜花饼当伴手礼'],
    ]],
    ['洱海西线 · 环湖骑行', '大理', [
      ['08:30', 'food', '客栈早餐后出发', '才村码头', 25.713, 100.142, 20, ''],
      ['09:30', 'sight', '租电动车环洱海西线', '环海西路', 25.75, 100.13, 100, '喜洲方向，一路都是稻田和海景'],
      ['12:00', 'food', '喜洲古镇午餐', '喜洲古镇', 25.856, 100.121, 90, '必吃喜洲粑粑，破酥粑粑'],
      ['14:00', 'sight', '海舍公园 + 廊桥拍照', '环海西路', 25.8, 100.13, 0, '下午光线最好'],
      ['18:30', 'food', '回古城吃烤肉', '叶榆路', 25.696, 100.158, 150, ''],
    ]],
    ['苍山 · 寂照庵 · 咖啡半日', '大理', [
      ['09:00', 'sight', '感通索道上苍山', '感通寺', 25.66, 100.175, 110, '山上冷，带外套'],
      ['11:00', 'sight', '寂照庵吃素斋', '寂照庵', 25.663, 100.177, 20, '多肉花园很出片，素斋 20 元管饱'],
      ['15:00', 'other', '双廊方向咖啡店发呆', '龙龛码头', 25.72, 100.19, 60, '看洱海日落'],
    ]],
    ['大理 → 丽江 · 束河慢时光', '丽江', [
      ['10:00', 'transport', '大理 → 丽江动车', '大理站', 25.606, 100.232, 34, '约 2 小时'],
      ['13:00', 'hotel', '入住束河古镇客栈', '束河古镇', 26.9, 100.194, 520, '比大研古镇安静'],
      ['15:00', 'sight', '束河古镇闲逛', '束河四方街', 26.901, 100.193, 0, '青龙桥、九鼎龙潭'],
      ['19:00', 'food', '腊排骨火锅', '束河仁里路', 26.902, 100.195, 180, '四人锅刚好'],
    ]],
    ['玉龙雪山一日游', '玉龙雪山', [
      ['07:30', 'transport', '包车出发雪山', '丽江古城口', 26.897, 100.2, 150, '提前一晚和司机确认'],
      ['09:00', 'sight', '冰川公园大索道', '玉龙雪山', 27.117, 100.171, 140, '氧气瓶提前买好，慢慢走'],
      ['12:30', 'food', '景区简餐', '蓝月谷附近', 27.09, 100.19, 60, ''],
      ['14:00', 'sight', '蓝月谷 · 白水河', '蓝月谷', 27.091, 100.191, 0, '牛奶蓝的湖水'],
      ['16:30', 'show', '印象丽江演出', '雪山剧场', 27.1, 100.18, 280, '可选，时间对得上就看'],
    ]],
    ['丽江古城 · 返程', '丽江', [
      ['09:00', 'sight', '大研古城 · 木府', '大研古镇', 26.898, 100.199, 60, '木府门票 60，讲解值得'],
      ['12:00', 'food', '告别午餐：野生菌火锅', '五一街', 26.894, 100.2, 200, '雨季菌子新鲜'],
      ['15:00', 'transport', '丽江三义机场返程', '丽江机场', 26.68, 100.24, 0, '买好鲜化和伴手礼'],
    ]],
  ];
  const dayIds: number[] = [];
  for (let i = 0; i < dayPlans.length; i++) {
    const plan = dayPlans[i];
    const dayId = Number((await insDay.run(tripId, i + 1, addDays(start, i), plan[0], plan[1])).lastInsertRowid);
    dayIds.push(dayId);
    const acts = plan[2] as any[][];
    for (let j = 0; j < acts.length; j++) {
      const a = acts[j];
      await insAct.run(tripId, dayId, j, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], nowISO());
    }
  }

  const insExp = d.prepare('INSERT INTO expenses (trip_id, payer_member_id, amount, category, title, date, split_mode, participants, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  await insExp.run(tripId, mDemo, 4300, '交通', '往返机票 + 动车（代订）', start, 'equal', '[]', mDemo, nowISO());
  await insExp.run(tripId, mLin, 1208, '住宿', '大理古城民宿 2 晚', addDays(start, 0), 'equal', '[]', mLin, nowISO());
  await insExp.run(tripId, mLin, 520, '住宿', '束河客栈 1 晚', addDays(start, 3), 'equal', '[]', mLin, nowISO());
  await insExp.run(tripId, mShu, 860, '门票', '雪山套票 + 印象丽江', addDays(start, 4), 'equal', '[]', mShu, nowISO());
  await insExp.run(tripId, mDemo, 456, '餐饮', '第一天白族晚餐 + 鲜花饼', start, 'equal', '[]', mDemo, nowISO());

  const insPack = d.prepare('INSERT INTO packing_items (trip_id, category, title, done, assignee_member_id, quantity, note, created_at) VALUES (?,?,?,?,?,?,?,?)');
  const packing: [string, string, number, number, string][] = [
    ['证件', '身份证', 1, 0, '全员必带，进雪山要查'],
    ['证件', '学生证（景区优惠）', 0, 0, ''],
    ['衣物', '防晒外套 / 冲锋衣', 1, 0, '雪山和早晚温差大'],
    ['衣物', '拍照裙子', 0, mLin, '红裙在洱海最出片'],
    ['电子', '充电宝（2 万毫安内）', 1, mShu, ''],
    ['电子', '相机 + 备用电池', 0, mLin, ''],
    ['洗护', '高倍防晒霜 SPF50+', 1, 0, '紫外线极强'],
    ['洗护', '墨镜 + 遮阳帽', 1, 0, ''],
    ['药品', '红景天（雪山用）', 1, 0, '提前一周喝'],
    ['药品', '肠胃药 / 感冒药', 0, 0, ''],
    ['其他', '现金少量（古镇摊位）', 1, 0, '200 元够了'],
  ];
  for (const p of packing) await insPack.run(tripId, p[0], p[1], p[2], p[3], 1, p[4], nowISO());

  const insNote = d.prepare('INSERT INTO journal_notes (trip_id, day_id, author_member_id, content, mood, created_at, updated_at) VALUES (?,?,?,?,?,?,?)');
  await insNote.run(tripId, null, mDemo, '行程基本敲定！机票已出，民宿订单发群里了。大家记得带防晒，雪山那天的氧气瓶我来统一买。', '🎉', nowISO(), nowISO());
  await insNote.run(tripId, null, mShu, '补了一份大理到丽江的动车时刻表，放在行程备注里了， 10 点那班时间最合适。', '📝', nowISO(), nowISO());

  const insLog = d.prepare('INSERT INTO activity_log (trip_id, user_id, member_name, avatar_color, action, detail, created_at) VALUES (?,?,?,?,?,?,?)');
  await insLog.run(tripId, demoId, '演示用户', '#2f6e4f', '创建了旅程', '云南大理丽江 · 6日慢游', nowISO());
  await insLog.run(tripId, linId, '小方', '#b5543b', '加入了旅程', '受邀成为成员', nowISO());
  await insLog.run(tripId, shuId, '阿树', '#3b6ea5', '加入了旅程', '受邀成为成员', nowISO());
  await insLog.run(tripId, mShu, '阿树', '#3b6ea5', '添加了 5 笔记账', '门票与住宿', nowISO());

  // 演示旅程内置锦囊（大理 + 丽江两站内容）
  const insGuide = d.prepare('INSERT INTO guide_cards (trip_id, category, icon, title, summary, items, source, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const cards = [...buildHandbook('大理'), ...buildHandbook('丽江')];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    await insGuide.run(tripId, c.category, c.icon, c.title, c.summary, JSON.stringify(c.items), 'builtin', i, nowISO());
  }
}

/** 初始化数据库：按 DATABASE_URL 选择驱动，建表并按需种子 */
export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    // PocketBay 要求 TLS；连接串自带 sslmode 时交给驱动解析，否则默认安全 TLS
    _pg = new Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes('sslmode=') ? undefined : { rejectUnauthorized: true },
    });
    _driver = 'postgres';
    await migratePg(_pg);
    await seedDemo(db());
    console.log(`  ➜ 数据库：PostgreSQL（托管）`);
  } else {
    const dbPath = process.env.GOTRIP_DB
      || (process.env.POCKETBAY_DATA_DIR ? path.join(process.env.POCKETBAY_DATA_DIR, 'gotrip.db') : '')
      || './data/gotrip.db';
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    _sqlite = new DatabaseSync(dbPath);
    _sqlite.exec('PRAGMA journal_mode = WAL;');
    _sqlite.exec('PRAGMA foreign_keys = ON;');
    migrateSqlite(_sqlite);
    _driver = 'sqlite';
    await seedDemo(db());
    console.log(`  ➜ 数据库：SQLite（${dbPath}）`);
  }
}
