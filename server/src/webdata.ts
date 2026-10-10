/** Web 版通用数据路由（PocketBay PG 部署，2026-10-10）。
 * 镜像客户端 rdb/entities.ts 的调用语义（gt_* 表 + snake_case 字段）：
 *   GET    /api/data/:table?where=&orderBy=&pageSize=   → { records: [...] }（行补 _id）
 *   GET    /api/data/:table/:id                         → 行或 {}
 *   POST   /api/data/:table            { data }          → { id }
 *   POST   /api/data/:table/bulk       { rows: [...] }   → { idList }
 *   PATCH  /api/data/:table/:id        { data }          → { ok: true }
 *   DELETE /api/data/:table/:id                          → { ok: true }
 *   POST   /api/data/:table/delete-many { where }        → { ok: true }
 * 行级隔离：所有查询/写入强制 user_id = 当前会话用户（列白名单防注入）。 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, json, nowISO, readBody } from './util.ts';
import { db, dbDriver, newId, TABLES, colSet, DATA_TABLES } from './db.ts';
import { requireUser } from './webauth.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

function assertTable(table: string): void {
  if (!DATA_TABLES.includes(table)) throw new ApiError(404, `未知数据表：${table}`);
}

/** 按当前驱动归一绑定值：sqlite 无 boolean/对象，一律转 1/0 与 JSON 串 */
function bindVal(v: any): any {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return dbDriver() === 'sqlite' ? (v ? 1 : 0) : v;
  if (v != null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** 过滤 data 键到表列白名单 */
function pickCols(table: string, data: any): Record<string, any> {
  const allowed = colSet(table);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

/** where → SQL 片段。仅支持 { col: value } 与 { col: { $eq: value } }（客户端只用这两种）。 */
function whereClause(table: string, where: any, params: any[]): string {
  const allowed = colSet(table);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(where || {})) {
    if (!allowed.has(k)) continue;
    const val = (v != null && typeof v === 'object' && '$eq' in (v as any)) ? (v as any).$eq : v;
    parts.push(`${k} = ?`);
    params.push(bindVal(val));
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

function orderByClause(table: string, orderBy: any): string {
  if (!Array.isArray(orderBy) || !orderBy.length) return '';
  const allowed = colSet(table);
  const parts: string[] = [];
  for (const o of orderBy) {
    if (!o || typeof o !== 'object') continue;
    for (const [col, dir] of Object.entries(o)) {
      if (!allowed.has(col)) continue;
      parts.push(`${col} ${String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`);
    }
  }
  return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
}

/** 行出栈：补 _id（客户端 withId 语义：_id 优先） */
function withUnderscoreId(row: any): any {
  return row && row.id != null && row._id == null ? { ...row, _id: row.id } : row;
}

async function createOne(table: string, userId: string, data: any): Promise<string> {
  const id = newId(TABLES[table].prefix);
  const cols = pickCols(table, data);
  const names = ['id', 'user_id', 'created_at', 'updated_at', ...Object.keys(cols)];
  const values = [id, userId, nowISO(), nowISO(), ...Object.values(cols).map(bindVal)];
  const sql = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
  await db().prepare(sql).run(...values);
  return id;
}

async function handleData(req: IncomingMessage, res: ServerResponse, url: string, method: string): Promise<boolean> {
  // 先剥集合级后缀（否则 /bulk 会被 ：id 段吞掉）
  const isBulk = url.endsWith('/bulk');
  const isDelMany = url.endsWith('/delete-many');
  const basePath = url.replace(/\/(bulk|delete-many)$/, '');
  const m = basePath.match(/^\/api\/data\/(\w+)(?:\/([^/]+))?$/);
  if (!m) return false;
  const table = m[1];
  assertTable(table);
  const user = await requireUser(req);
  const rest = isBulk ? 'bulk' : isDelMany ? 'delete-many' : undefined;

  if (method === 'GET' && !m[2]) {
    const q = new URLSearchParams((req.url || '').split('?')[1] || '');
    let where: any = {};
    let orderBy: any;
    let pageSize = 100;
    try { where = q.get('where') ? JSON.parse(q.get('where')!) : {}; } catch { /* 空 */ }
    try { orderBy = q.get('orderBy') ? JSON.parse(q.get('orderBy')!) : undefined; } catch { /* 空 */ }
    const ps = Number(q.get('pageSize'));
    if (ps > 0) pageSize = Math.min(500, ps);
    const params: any[] = [user.id];
    const sql = `SELECT * FROM ${table} WHERE user_id = ?${whereClause(table, where, params)}${orderByClause(table, orderBy)} LIMIT ${pageSize}`;
    const rows = await db().prepare(sql).all(...params);
    json(res, 200, { records: rows.map(withUnderscoreId) });
    return true;
  }

  if (method === 'GET' && m[2] && !rest) {
    const row = await db().prepare(`SELECT * FROM ${table} WHERE user_id = ? AND id = ?`).get(user.id, m[2]);
    json(res, 200, withUnderscoreId(row || {}));
    return true;
  }

  if (method === 'POST' && !m[2] && !rest) {
    const body = await readBody(req);
    const id = await createOne(table, user.id, body.data);
    json(res, 200, { id });
    return true;
  }

  if (method === 'POST' && rest === 'bulk') {
    const body = await readBody(req);
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 200) : [];
    const idList: string[] = [];
    for (const r of rows) idList.push(await createOne(table, user.id, r));
    json(res, 200, { idList });
    return true;
  }

  if (method === 'POST' && rest === 'delete-many') {
    const body = await readBody(req);
    const params: any[] = [user.id];
    const clause = whereClause(table, body.where, params);
    if (!clause) throw new ApiError(400, '缺少删除条件');
    const r = await db().prepare(`DELETE FROM ${table} WHERE user_id = ?${clause}`).run(...params);
    json(res, 200, { ok: true, changes: r.changes });
    return true;
  }

  if (method === 'PATCH' && m[2]) {
    const body = await readBody(req);
    const cols = pickCols(table, body.data);
    const keys = Object.keys(cols);
    if (!keys.length) { json(res, 200, { ok: true }); return true; }
    const params: any[] = [...keys.map(k => bindVal(cols[k])), nowISO(), user.id, m[2]];
    await db().prepare(
      `UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE user_id = ? AND id = ?`
    ).run(...params);
    json(res, 200, { ok: true });
    return true;
  }

  if (method === 'DELETE' && m[2]) {
    await db().prepare(`DELETE FROM ${table} WHERE user_id = ? AND id = ?`).run(user.id, m[2]);
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}

/** 供 index.ts 前置调用：命中 /api/data/* 返回 true（未匹配子路径时 404）。 */
export async function handleWebData(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = (req.url || '/').split('?')[0];
  if (!url.startsWith('/api/data/')) return false;
  const method = (req.method || 'GET').toUpperCase();
  const handled = await handleData(req, res, url, method);
  if (!handled) json(res, 404, { error: '接口不存在' });
  return true;
}
