import crypto from 'node:crypto';
import path from 'node:path';
import { nowISO } from './util.ts';

/* ============================================================
 * 数据访问层（Web 版 PocketBay 部署，2026-10-10）
 *  - 设置 DATABASE_URL 时使用平台托管 PostgreSQL（pg Pool，强制 TLS）
 *  - 未设置时回退本地 SQLite（node:sqlite），本地开发零配置
 * 统一异步 API：db().prepare(sql) → { get, all, run }（均为 Promise），
 * run() 返回 { lastInsertRowid }（PG 通过 INSERT ... RETURNING id 模拟）。
 * SQLite 占位符 ? → PostgreSQL $1..$n。
 * 表结构：与客户端 rdb 层同构的 gt_* 表（TEXT 主键 id + user_id 行级隔离）。
 * ============================================================ */

export type DbDriver = 'sqlite' | 'postgres';
let _driver: DbDriver = 'sqlite';
let _sqlite: any = null;
let _pg: any = null;

export function dbDriver(): DbDriver { return _driver; }

function toPgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

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
        const isInsert = /^\s*insert/i.test(sql) && !/returning/i.test(sql) && !/\binsert\s+into\s+gt_sessions\b/i.test(sql);
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
            return { lastInsertRowid: isInsert ? String(r.rows[0]?.id ?? '') : '', changes: r.rowCount ?? 0 };
          },
        };
      },
    };
  }
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

/** 行 id：带前缀的随机串（客户端 rdb 层按字符串 _id 消费） */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/* ==================== 表定义（列白名单 + DDL 同源） ====================
 * 每表：[列名, SQLite 类型, PG 类型]；id/user_id/created_at/updated_at 全表通用
 * （gt_users 无 user_id——它就是身份表；gt_activity_log 等同样带 user_id 归属）。 */

type Col = [name: string, sqliteType: string, pgType: string];

export interface TableDef {
  prefix: string;
  cols: Col[];
}

export const TABLES: Record<string, TableDef> = {
  gt_users: {
    prefix: 'u',
    cols: [
      ['username', 'TEXT UNIQUE', 'TEXT UNIQUE'],
      ['password_hash', 'TEXT', 'TEXT'],
      ['nickname', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['avatar_color', 'TEXT NOT NULL DEFAULT \'#0071e3\'', 'TEXT NOT NULL DEFAULT \'#0071e3\''],
      ['bio', 'TEXT', 'TEXT'],
      ['avatar_url', 'TEXT', 'TEXT'],
    ],
  },
  gt_sessions: { prefix: 's', cols: [] },
  gt_trips: {
    prefix: 't',
    cols: [
      ['title', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['destination', 'TEXT', 'TEXT'],
      ['description', 'TEXT', 'TEXT'],
      ['start_date', 'TEXT', 'TEXT'],
      ['end_date', 'TEXT', 'TEXT'],
      ['cover_emoji', 'TEXT', 'TEXT'],
      ['cover_color', 'TEXT', 'TEXT'],
      ['cover_image', 'TEXT', 'TEXT'],
      ['budget', 'REAL DEFAULT 0', 'DOUBLE PRECISION DEFAULT 0'],
      ['visibility', 'TEXT DEFAULT \'private\'', 'TEXT DEFAULT \'private\''],
      ['share_token', 'TEXT', 'TEXT'],
    ],
  },
  gt_trip_members: {
    prefix: 'm',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['role', 'TEXT DEFAULT \'editor\'', 'TEXT DEFAULT \'editor\''],
      ['display_name', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['avatar_color', 'TEXT', 'TEXT'],
    ],
  },
  gt_days: {
    prefix: 'd',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['day_number', 'INTEGER DEFAULT 1', 'INTEGER DEFAULT 1'],
      ['date', 'TEXT', 'TEXT'],
      ['title', 'TEXT', 'TEXT'],
      ['place', 'TEXT', 'TEXT'],
    ],
  },
  gt_activities: {
    prefix: 'a',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['day_id', 'TEXT', 'TEXT'],
      ['sort', 'INTEGER DEFAULT 0', 'INTEGER DEFAULT 0'],
      ['time', 'TEXT', 'TEXT'],
      ['end_time', 'TEXT', 'TEXT'],
      ['kind', 'TEXT DEFAULT \'sight\'', 'TEXT DEFAULT \'sight\''],
      ['title', 'TEXT', 'TEXT'],
      ['place', 'TEXT', 'TEXT'],
      ['lat', 'REAL', 'DOUBLE PRECISION'],
      ['lng', 'REAL', 'DOUBLE PRECISION'],
      ['cost', 'REAL DEFAULT 0', 'DOUBLE PRECISION DEFAULT 0'],
      ['notes', 'TEXT', 'TEXT'],
      ['status', 'TEXT', 'TEXT'],
      ['assignee_member_id', 'TEXT', 'TEXT'],
    ],
  },
  gt_expenses: {
    prefix: 'e',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['payer_member_id', 'TEXT', 'TEXT'],
      ['amount', 'REAL DEFAULT 0', 'DOUBLE PRECISION DEFAULT 0'],
      ['category', 'TEXT', 'TEXT'],
      ['title', 'TEXT', 'TEXT'],
      ['date', 'TEXT', 'TEXT'],
      ['split_mode', 'TEXT', 'TEXT'],
      ['participants', 'TEXT', 'TEXT'],
    ],
  },
  gt_packing_items: {
    prefix: 'p',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['category', 'TEXT', 'TEXT'],
      ['title', 'TEXT', 'TEXT'],
      ['done', 'INTEGER DEFAULT 0', 'BOOLEAN DEFAULT FALSE'],
      ['assignee_member_id', 'TEXT', 'TEXT'],
      ['quantity', 'INTEGER DEFAULT 1', 'INTEGER DEFAULT 1'],
      ['note', 'TEXT', 'TEXT'],
    ],
  },
  gt_journal_notes: {
    prefix: 'j',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['day_id', 'TEXT', 'TEXT'],
      ['author_member_id', 'TEXT', 'TEXT'],
      ['content', 'TEXT', 'TEXT'],
      ['mood', 'TEXT', 'TEXT'],
      ['images', 'TEXT', 'TEXT'],
    ],
  },
  gt_activity_log: {
    prefix: 'f',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['member_name', 'TEXT', 'TEXT'],
      ['avatar_color', 'TEXT', 'TEXT'],
      ['action', 'TEXT', 'TEXT'],
      ['detail', 'TEXT', 'TEXT'],
    ],
  },
  gt_guide_cards: {
    prefix: 'g',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['sort', 'INTEGER DEFAULT 0', 'INTEGER DEFAULT 0'],
      ['icon', 'TEXT', 'TEXT'],
      ['title', 'TEXT', 'TEXT'],
      ['summary', 'TEXT', 'TEXT'],
      ['items', 'TEXT', 'TEXT'],
    ],
  },
  gt_travel_links: {
    prefix: 'l',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['type', 'TEXT', 'TEXT'],
      ['title', 'TEXT', 'TEXT'],
      ['url', 'TEXT', 'TEXT'],
      ['note', 'TEXT', 'TEXT'],
    ],
  },
  gt_trip_places: {
    prefix: 'pl',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['kind', 'TEXT', 'TEXT'],
      ['name', 'TEXT', 'TEXT'],
      ['city', 'TEXT', 'TEXT'],
      ['address', 'TEXT', 'TEXT'],
      ['lat', 'REAL', 'DOUBLE PRECISION'],
      ['lng', 'REAL', 'DOUBLE PRECISION'],
      ['note', 'TEXT', 'TEXT'],
      ['dishes', 'TEXT', 'TEXT'],
      ['status', 'TEXT', 'TEXT'],
      ['candidate', 'INTEGER DEFAULT 1', 'BOOLEAN DEFAULT TRUE'],
      ['sort', 'INTEGER DEFAULT 0', 'INTEGER DEFAULT 0'],
    ],
  },
  gt_trip_cash_items: {
    prefix: 'c',
    cols: [
      ['trip_id', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['title', 'TEXT', 'TEXT'],
      ['amount', 'REAL DEFAULT 0', 'DOUBLE PRECISION DEFAULT 0'],
      ['currency', 'TEXT DEFAULT \'CNY\'', 'TEXT DEFAULT \'CNY\''],
      ['per_person', 'INTEGER DEFAULT 0', 'BOOLEAN DEFAULT FALSE'],
      ['people', 'INTEGER DEFAULT 1', 'INTEGER DEFAULT 1'],
      ['total', 'REAL DEFAULT 0', 'DOUBLE PRECISION DEFAULT 0'],
      ['day_id', 'TEXT', 'TEXT'],
      ['ref_kind', 'TEXT', 'TEXT'],
      ['ref_id', 'TEXT', 'TEXT'],
    ],
  },
  gt_flywhere_watch: {
    prefix: 'w',
    cols: [
      ['route_key', 'TEXT NOT NULL', 'TEXT NOT NULL'],
      ['city', 'TEXT', 'TEXT'],
      ['min_per_person', 'REAL', 'DOUBLE PRECISION'],
      ['checked_at', 'TEXT', 'TEXT'],
    ],
  },
};

/** 数据表（带 user_id 行级隔离）；gt_users/gt_sessions 是身份表不在此列 */
export const DATA_TABLES = Object.keys(TABLES).filter(t => t.startsWith('gt_') && t !== 'gt_users' && t !== 'gt_sessions');

export function colSet(table: string): Set<string> {
  return new Set(TABLES[table].cols.map(c => c[0]));
}

/** 启动时建表（幂等）。返回驱动名。 */
export async function ensureSchema(): Promise<DbDriver> {
  const url = process.env.DATABASE_URL || '';
  if (url) {
    const { Pool } = await import('pg');
    _pg = new Pool({
      connectionString: url,
      max: 5,
      ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    });
    _driver = 'postgres';
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    // 落盘文件：--watch 重启不丢数据（:memory: 会在每次重载时清库）
    const { mkdirSync } = await import('node:fs');
    const dataDir = path.resolve(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });
    _sqlite = new DatabaseSync(path.join(dataDir, 'gotrip.db'));
    _driver = 'sqlite';
  }
  const exec = async (sql: string): Promise<void> => {
    if (_driver === 'postgres') await _pg.query(sql);
    else _sqlite.exec(sql);
  };
  for (const [table, def] of Object.entries(TABLES)) {
    if (table === 'gt_sessions') {
      // 会话表：主键 token，无 id 列（webauth 的 INSERT 只给 token/user_id/created_at）
      await exec(`CREATE TABLE IF NOT EXISTS gt_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
      continue;
    }
    const isUsers = table === 'gt_users';
    const isSession = table === 'gt_sessions';
    const cols = [
      isSession ? 'token TEXT PRIMARY KEY' : 'id TEXT PRIMARY KEY',
      ...(isUsers || isSession ? [] : ['user_id TEXT NOT NULL']),
      ...def.cols.map(c => `${c[0]} ${_driver === 'postgres' ? c[2] : c[1]}`),
      ...(isSession ? [] : ['created_at TEXT NOT NULL', 'updated_at TEXT NOT NULL']),
    ].join(',\n  ');
    await exec(`CREATE TABLE IF NOT EXISTS ${table} (\n  ${cols}\n)`);
  }
  return _driver;
}
