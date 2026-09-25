import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { nowISO, addDays, todayStr } from './util.ts';
import { hashPassword } from './auth.ts';
import { buildHandbook } from './handbook.ts';

/* ============================================================
 * 数据访问层：三驱动
 *  - 设置 DATABASE_URL 时使用 PocketBay 托管 PostgreSQL（pg Pool，max 5，强制 TLS）
 *  - 设置 MYSQL_ADDRESS 时使用微信云托管内置 MySQL（mysql2 连接池，自动建库建表）
 *  - 未设置时回退本地 SQLite（node:sqlite），本地开发零配置
 * 统一异步 API：db().prepare(sql) → { get, all, run }（均为 Promise），
 * run() 返回 { lastInsertRowid }（PG 通过 INSERT ... RETURNING id 模拟，MySQL 用 insertId）
 * ============================================================ */

export type DbDriver = 'sqlite' | 'postgres' | 'mysql';
let _driver: DbDriver = 'sqlite';
let _sqlite: DatabaseSync | null = null;
let _pg: any = null;
let _mysql: any = null;

export function dbDriver(): DbDriver { return _driver; }

/** SQLite 占位符 ? → PostgreSQL $1..$n（MySQL 原生就是 ?，无需转换） */
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
  if (_driver === 'mysql') {
    return {
      prepare(sql: string): Stmt {
        return {
          async get(...params: any[]) {
            const [rows] = await _mysql.query(sql, params.map((p: any) => p === undefined ? null : p));
            return (rows as any[])[0];
          },
          async all(...params: any[]) {
            const [rows] = await _mysql.query(sql, params.map((p: any) => p === undefined ? null : p));
            return rows as any[];
          },
          async run(...params: any[]) {
            const [r] = await _mysql.query(sql, params.map((p: any) => p === undefined ? null : p));
            return { lastInsertRowid: Number((r as any).insertId) || 0, changes: (r as any).affectedRows ?? 0 };
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
    wechat_openid TEXT,
    avatar_url TEXT,
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
    cover_image TEXT,
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
    status TEXT,
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
  CREATE TABLE IF NOT EXISTS trip_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'attraction',
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    note TEXT NOT NULL DEFAULT '',
    dishes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待确认',
    candidate INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_places_trip ON trip_places(trip_id);
  CREATE TABLE IF NOT EXISTS trip_cash_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    per_person INTEGER NOT NULL DEFAULT 0,
    people INTEGER NOT NULL DEFAULT 1,
    total REAL NOT NULL DEFAULT 0,
    day_id INTEGER,
    ref_kind TEXT,
    ref_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cash_trip ON trip_cash_items(trip_id);
  `);

  // 旧库平滑升级：缺列补列 + 攻略链接表 + 飞哪儿价格记忆 + 微信静默登录列（幂等，可重复执行）
  try { d.exec("ALTER TABLE journal_notes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'"); } catch { /* 已存在 */ }
  try { d.exec('ALTER TABLE users ADD COLUMN wechat_openid TEXT'); } catch { /* 已存在 */ }
  try { d.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch { /* 已存在 */ }
  try { d.exec('ALTER TABLE trips ADD COLUMN cover_image TEXT'); } catch { /* 已存在 */ }
  try { d.exec('ALTER TABLE activities ADD COLUMN status TEXT'); } catch { /* 已存在 */ }
  d.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openid ON users(wechat_openid)');
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
    wechat_openid TEXT,
    avatar_url TEXT,
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
    cover_image TEXT,
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
    status TEXT,
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

  // 旧库平滑升级：缺列补列 + 攻略链接表 + 飞哪儿价格记忆 + 微信静默登录列（幂等，可重复执行）
  await pg.query("ALTER TABLE journal_notes ADD COLUMN IF NOT EXISTS images TEXT NOT NULL DEFAULT '[]'").catch(() => undefined);
  await pg.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid TEXT').catch(() => undefined);
  await pg.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT').catch(() => undefined);
  await pg.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openid ON users(wechat_openid)').catch(() => undefined);
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
  CREATE TABLE IF NOT EXISTS trip_places (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'attraction',
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    note TEXT NOT NULL DEFAULT '',
    dishes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待确认',
    candidate BOOLEAN NOT NULL DEFAULT false,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_places_trip ON trip_places(trip_id);
  CREATE TABLE IF NOT EXISTS trip_cash_items (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    per_person BOOLEAN NOT NULL DEFAULT false,
    people INTEGER NOT NULL DEFAULT 1,
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    day_id INTEGER,
    ref_kind TEXT,
    ref_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cash_trip ON trip_cash_items(trip_id);
  `);

  // 旧库平滑升级：缺列补列 + 攻略链接表 + 飞哪儿价格记忆 + 微信静默登录列（幂等，可重复执行）
  await pg.query("ALTER TABLE journal_notes ADD COLUMN IF NOT EXISTS images TEXT NOT NULL DEFAULT '[]'").catch(() => undefined);
  await pg.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid TEXT').catch(() => undefined);
  await pg.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT').catch(() => undefined);
  await pg.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS cover_image TEXT').catch(() => undefined);
  await pg.query('ALTER TABLE activities ADD COLUMN IF NOT EXISTS status TEXT').catch(() => undefined);
  await pg.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openid ON users(wechat_openid)').catch(() => undefined);
}

/** MySQL 建表（微信云托管内置 MySQL，语义与 SQLite/PG 版一致；首次部署即最新结构，无需补列 ALTER）。
 *  ⚠️ mysql2 默认单次只执行一条语句（multipleStatements 关闭），必须逐条拆分执行。 */
async function migrateMysql(m: any): Promise<void> {
  const ddl = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    travel_id INT UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    nickname VARCHAR(64) NOT NULL,
    avatar_color VARCHAR(16) NOT NULL DEFAULT '#2f6e4f',
    bio VARCHAR(512) NOT NULL DEFAULT '',
    wechat_openid VARCHAR(64) NULL,
    avatar_url MEDIUMTEXT NULL,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS trips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL REFERENCES users(id),
    title VARCHAR(128) NOT NULL,
    destination VARCHAR(128) NOT NULL DEFAULT '',
    description VARCHAR(512) NOT NULL DEFAULT '',
    start_date VARCHAR(16) NOT NULL,
    end_date VARCHAR(16) NOT NULL,
    cover_emoji VARCHAR(8) NOT NULL DEFAULT '🧭',
    cover_color VARCHAR(16) NOT NULL DEFAULT '#2f6e4f',
    cover_image MEDIUMTEXT NULL,
    budget DOUBLE NOT NULL DEFAULT 0,
    visibility VARCHAR(16) NOT NULL DEFAULT 'private',
    share_token VARCHAR(64) NULL,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS trip_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'editor',
    display_name VARCHAR(64) NOT NULL,
    avatar_color VARCHAR(16) NOT NULL DEFAULT '#8a6d3b',
    location VARCHAR(128) NULL,
    location_lat DOUBLE NULL,
    location_lng DOUBLE NULL,
    location_at VARCHAR(32) NULL,
    joined_at VARCHAR(32) NOT NULL,
    UNIQUE(trip_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS invites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    code VARCHAR(32) UNIQUE NOT NULL,
    created_by INT NOT NULL,
    max_uses INT NOT NULL DEFAULT 0,
    uses INT NOT NULL DEFAULT 0,
    expires_at VARCHAR(32) NULL,
    revoked TINYINT NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS days (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_number INT NOT NULL,
    date VARCHAR(16) NOT NULL,
    title VARCHAR(128) NOT NULL DEFAULT '',
    place VARCHAR(128) NOT NULL DEFAULT '',
    UNIQUE(trip_id, day_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id INT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
    sort INT NOT NULL DEFAULT 0,
    time VARCHAR(8) NULL,
    end_time VARCHAR(8) NULL,
    kind VARCHAR(16) NOT NULL DEFAULT 'sight',
    title VARCHAR(128) NOT NULL,
    place VARCHAR(128) NOT NULL DEFAULT '',
    lat DOUBLE NULL,
    lng DOUBLE NULL,
    cost DOUBLE NOT NULL DEFAULT 0,
    notes TEXT NOT NULL,
    status VARCHAR(16) NULL,
    assignee_id INT NULL,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    payer_member_id INT NOT NULL,
    amount DOUBLE NOT NULL,
    category VARCHAR(16) NOT NULL DEFAULT '其他',
    title VARCHAR(128) NOT NULL,
    date VARCHAR(16) NOT NULL,
    split_mode VARCHAR(16) NOT NULL DEFAULT 'equal',
    participants TEXT NOT NULL,
    created_by INT NULL,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS packing_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category VARCHAR(16) NOT NULL DEFAULT '其他',
    title VARCHAR(128) NOT NULL,
    done TINYINT NOT NULL DEFAULT 0,
    assignee_member_id INT NULL,
    quantity INT NOT NULL DEFAULT 1,
    note VARCHAR(256) NOT NULL DEFAULT '',
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS journal_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id INT NULL,
    author_member_id INT NOT NULL,
    content TEXT NOT NULL,
    mood VARCHAR(8) NOT NULL DEFAULT '🙂',
    images MEDIUMTEXT NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id INT NULL,
    member_name VARCHAR(64) NOT NULL,
    avatar_color VARCHAR(16) NOT NULL DEFAULT '#2f6e4f',
    action VARCHAR(64) NOT NULL,
    detail VARCHAR(256) NOT NULL DEFAULT '',
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS guide_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category VARCHAR(16) NOT NULL DEFAULT 'tip',
    icon VARCHAR(8) NOT NULL DEFAULT '📌',
    title VARCHAR(128) NOT NULL,
    summary VARCHAR(512) NOT NULL DEFAULT '',
    items TEXT NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'builtin',
    sort INT NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE INDEX idx_activities_day ON activities(day_id);
  CREATE INDEX idx_members_trip ON trip_members(trip_id);
  CREATE INDEX idx_guide_trip ON guide_cards(trip_id);
  CREATE TABLE IF NOT EXISTS travel_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    type VARCHAR(16) NOT NULL DEFAULT 'web',
    title VARCHAR(128) NOT NULL,
    url VARCHAR(512) NOT NULL,
    note VARCHAR(256) NOT NULL DEFAULT '',
    created_by INT NULL,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE INDEX idx_links_trip ON travel_links(trip_id);
  CREATE TABLE IF NOT EXISTS flywhere_watch (
    id INT AUTO_INCREMENT PRIMARY KEY,
    route_key VARCHAR(128) UNIQUE NOT NULL,
    city VARCHAR(64) NOT NULL DEFAULT '',
    min_per_person DOUBLE NOT NULL,
    checked_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE TABLE IF NOT EXISTS trip_places (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    kind VARCHAR(16) NOT NULL DEFAULT 'attraction',
    name VARCHAR(128) NOT NULL,
    city VARCHAR(64) NOT NULL DEFAULT '',
    address VARCHAR(256) NOT NULL DEFAULT '',
    lat DOUBLE NULL,
    lng DOUBLE NULL,
    note VARCHAR(512) NOT NULL DEFAULT '',
    dishes VARCHAR(512) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT '待确认',
    candidate TINYINT NOT NULL DEFAULT 0,
    sort INT NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE INDEX idx_places_trip ON trip_places(trip_id);
  CREATE TABLE IF NOT EXISTS trip_cash_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    amount DOUBLE NOT NULL DEFAULT 0,
    currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
    per_person TINYINT NOT NULL DEFAULT 0,
    people INT NOT NULL DEFAULT 1,
    total DOUBLE NOT NULL DEFAULT 0,
    day_id INT NULL,
    ref_kind VARCHAR(16) NULL,
    ref_id INT NULL,
    created_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  CREATE INDEX idx_cash_trip ON trip_cash_items(trip_id);
  `;
  for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
    try {
      await m.query(stmt);
    } catch (e: any) {
      // MySQL 无 CREATE INDEX IF NOT EXISTS：重跑迁移时索引已存在属正常，其余错误照抛
      if (e && e.code === 'ER_DUP_KEYNAME') continue;
      throw e;
    }
  }
  // 旧库平滑升级（MySQL 无 ADD COLUMN / CREATE INDEX IF NOT EXISTS，逐条 try/catch，可重复执行）
  for (const ddl of [
    'ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(64) NULL',
    'ALTER TABLE users ADD COLUMN avatar_url MEDIUMTEXT NULL',
    'CREATE UNIQUE INDEX idx_users_openid ON users(wechat_openid)',
    'ALTER TABLE trips ADD COLUMN cover_image MEDIUMTEXT NULL',
    'ALTER TABLE activities ADD COLUMN status VARCHAR(16) NULL',
    // 头像 dataURL 允许 200KB、日志图片内联后更大，TEXT(64KB) 不够——升列宽（幂等）。
    // ⚠️ 不要给 images 补 DEFAULT ('[]')：表达式默认值是 MySQL 8.0.13+ 语法，云托管内置 MySQL
    //    在更低版本上整段 CREATE TABLE 直接 1064，启动永远起不来（2026-09-20 gotrip-013 实锤）。
    //    1364（NOT NULL 无默认值）靠 INSERT 显式列全来防：db.ts 种子与 /journal 两条写入路径
    //    都已带 images 列，加列时请保持这一点。
    'ALTER TABLE users MODIFY avatar_url MEDIUMTEXT NULL',
    'UPDATE journal_notes SET images = \'[]\' WHERE images IS NULL OR images = \'\'',
    'ALTER TABLE journal_notes MODIFY images MEDIUMTEXT NOT NULL',
  ]) {
    try { await m.query(ddl); } catch { /* 已存在 */ }
  }
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
  const existing = Number(count.c ?? 0);
  // 这行日志是判据：空库=新建/被回收，非空=沿用旧数据（数据迁移与事故复盘都靠它）
  if (existing > 0) { console.log(`  ➜ 种子数据：跳过（库里已有 ${existing} 个用户）`); return; }

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

  const insNote = d.prepare('INSERT INTO journal_notes (trip_id, day_id, author_member_id, content, mood, images, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)');
  await insNote.run(tripId, null, mDemo, '行程基本敲定！机票已出，民宿订单发群里了。大家记得带防晒，雪山那天的氧气瓶我来统一买。', '🎉', '[]', nowISO(), nowISO());
  await insNote.run(tripId, null, mShu, '补了一份大理到丽江的动车时刻表，放在行程备注里了， 10 点那班时间最合适。', '📝', '[]', nowISO(), nowISO());

  const insLog = d.prepare('INSERT INTO activity_log (trip_id, user_id, member_name, avatar_color, action, detail, created_at) VALUES (?,?,?,?,?,?,?)');
  await insLog.run(tripId, demoId, '演示用户', '#2f6e4f', '创建了旅程', '云南大理丽江 · 6日慢游', nowISO());
  await insLog.run(tripId, linId, '小方', '#b5543b', '加入了旅程', '受邀成为成员', nowISO());
  await insLog.run(tripId, shuId, '阿树', '#3b6ea5', '加入了旅程', '受邀成为成员', nowISO());
  await insLog.run(tripId, shuId, '阿树', '#3b6ea5', '添加了 5 笔记账', '门票与住宿', nowISO());

  // 演示旅程内置锦囊（大理 + 丽江两站内容）
  const insGuide = d.prepare('INSERT INTO guide_cards (trip_id, category, icon, title, summary, items, source, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const cards = [...buildHandbook('大理'), ...buildHandbook('丽江')];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    await insGuide.run(tripId, c.category, c.icon, c.title, c.summary, JSON.stringify(c.items), 'builtin', i, nowISO());
  }
  console.log('  ➜ 种子数据：空库，已写入演示账号与种子旅程');
}

/* ---------------- 启动就绪状态（HTTP 层据此决定 503，见 index.ts / ws.ts） ----------------
 * 云托管内置 MySQL 是 Serverless：实例闲置后会暂停，首次连接要等它恢复（可达几十秒），
 * 连接失败在这个平台上是常态而非致命错误。历史事故：initDb 抛错让进程退出 → 端口从未
 * 监听 → 平台认为实例不可用 → 容器反复重启，公网域名一直 504、Webshell 也进不去。
 * 所以 initDb 改成「无限退避重试 + 就绪标记」，由调用方先 listen 再后台补齐。 */
let _ready = false;
const _boot = { attempts: 0, lastError: '' };

/** 数据库是否已建表就绪；未就绪时 db() 句柄不可用，上层必须先拦一道 */
export function dbReady(): boolean { return _ready; }

/** 未就绪期间的启动进度（重试次数、最后一次错误），供 /health 汇报 */
export function dbBootStatus(): { attempts: number; lastError: string } { return { ..._boot }; }

export async function initDb(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    _boot.attempts = attempt;
    try {
      await initDbOnce();
      _ready = true;
      _boot.lastError = '';
      return;
    } catch (e: any) {
      _boot.lastError = String(e?.message || e);
      // 半截连接池留着会越试越多，失败即关掉重来
      await closePools();
      const waitSec = Math.min(5 * attempt, 30);
      console.error(`[db] 初始化失败（第 ${attempt} 次）：${_boot.lastError}`);
      if (attempt === 3) {
        console.error('     连续失败 3 次：请核对平台注入的数据库配置（云托管 MYSQL_ADDRESS/MYSQL_USERNAME/MYSQL_PASSWORD，'
          + '或 DATABASE_URL）。若是内置 MySQL 冷启动暂停，通常再等 1~2 分钟会自动就绪。');
      }
      console.error(`     ${waitSec} 秒后重试（数据库未就绪期间接口返回 503）…`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
}

async function closePools(): Promise<void> {
  try { await _pg?.end(); } catch { /* 已断开 */ }
  try { await _mysql?.end(); } catch { /* 已断开 */ }
  _pg = null;
  _mysql = null;
}

/** 单次初始化：按环境变量选择驱动（DATABASE_URL=PG / MYSQL_ADDRESS=微信云托管内置 MySQL），建表并按需种子 */
async function initDbOnce(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const mysqlAddr = process.env.MYSQL_ADDRESS; // 云托管注入 host:port
  if (url) {
    const { Pool } = await import('pg');
    // PocketBay 要求 TLS；连接串自带 sslmode 时交给驱动解析，否则默认安全 TLS
    _pg = new Pool({
      connectionString: url,
      max: 5,
      // 默认 0 = 连不上就一直挂着，会让启动卡死；给足冷启动时间又要能失败重试
      connectionTimeoutMillis: 15_000,
      ssl: url.includes('sslmode=') ? undefined : { rejectUnauthorized: true },
    });
    _driver = 'postgres';
    await migratePg(_pg);
    await seedDemo(db());
    console.log(`  ➜ 数据库：PostgreSQL（托管）`);
  } else if (mysqlAddr) {
    const mysql = await import('mysql2/promise');
    const [host, portStr] = mysqlAddr.split(':');
    const base = {
      host,
      port: Number(portStr) || 3306,
      user: process.env.MYSQL_USERNAME || '',
      password: process.env.MYSQL_PASSWORD || '',
      charset: 'utf8mb4',
      connectionLimit: 5,
      connectTimeout: 15_000, // 内置 MySQL 暂停时 TCP 可能连得上但不回包，不能无限等
    };
    // 先用独立连接建库（内置 MySQL 初始只有系统库），再用连接池挂到 gotrip 库
    const bootstrap = await mysql.createConnection(base);
    await bootstrap.query('CREATE DATABASE IF NOT EXISTS gotrip CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await bootstrap.end();
    _mysql = mysql.createPool({ ...base, database: 'gotrip' });
    _driver = 'mysql';
    // 版本打进日志：方言兼容坑（如表达式默认值要 8.0.13+）全靠这行定位，别再靠猜
    let mysqlVersion = '未知';
    try {
      const [rows] = await _mysql.query('SELECT VERSION() AS v');
      mysqlVersion = String(rows?.[0]?.v || '未知');
    } catch { /* 版本查不到不影响启动 */ }
    await migrateMysql(_mysql);
    await seedDemo(db());
    console.log(`  ➜ 数据库：MySQL（微信云托管内置 · 服务端版本 ${mysqlVersion}）`);
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
