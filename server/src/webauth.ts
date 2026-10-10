/** Web 版身份认证（PocketBay PG 部署，2026-10-10）。
 * 账密注册/登录 + 游客试用；token 存 gt_sessions，Bearer 头携带。
 * 行级隔离：所有数据行挂 user_id（= gt_users.id），数据路由强制注入。 */
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ApiError, json, nowISO, readBody } from './util.ts';
import { db, newId } from './db.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
}

export interface UserRow {
  id: string;
  username: string | null;
  nickname: string;
  avatar_color: string;
  bio: string | null;
  avatar_url: string | null;
}

/** Bearer token → 用户行；无/失效抛 401 */
export async function requireUser(req: IncomingMessage): Promise<UserRow> {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ApiError(401, '请先登录');
  const row = await db().prepare(
    'SELECT u.id, u.username, u.nickname, u.avatar_color, u.bio, u.avatar_url FROM gt_sessions s JOIN gt_users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token);
  if (!row) throw new ApiError(401, '登录已过期，请重新登录');
  return row as UserRow;
}

async function issueSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db().prepare('INSERT INTO gt_sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, nowISO());
  return token;
}

function publicUser(u: UserRow) {
  return { id: u.id, username: u.username, nickname: u.nickname, avatarColor: u.avatar_color, bio: u.bio || '', avatarUrl: u.avatar_url };
}

/** 建用户并签发会话。username=null 为游客。 */
async function createUser(opts: { username: string | null; password?: string; nickname: string }): Promise<{ token: string; user: any }> {
  const palette = ['#0071e3', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ff2d55', '#5ac8fa', '#64d2ff'];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const id = newId('u');
  await db().prepare(
    'INSERT INTO gt_users (id, username, password_hash, nickname, avatar_color, bio, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, opts.username, opts.password ? hashPassword(opts.password) : null, opts.nickname, color, '', null, nowISO(), nowISO());
  const token = await issueSession(id);
  return { token, user: { id, username: opts.username, nickname: opts.nickname, avatarColor: color, bio: '', avatarUrl: null } };
}

/* 简易限速：认证端点每 IP 每分钟 12 次 */
const RATE = new Map<string, number[]>();
function rateLimit(ip: string): void {
  const now = Date.now();
  const arr = (RATE.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 12) throw new ApiError(429, '尝试太频繁，请一分钟后再试');
  arr.push(now);
  RATE.set(ip, arr);
  if (RATE.size > 5000) RATE.clear();
}

type Handler = (req: IncomingMessage, res: any, params: Record<string, string>, body: any) => Promise<void> | void;
const AUTH_ROUTES: { method: string; pattern: string; handler: Handler }[] = [];

function authRoute(method: string, pattern: string, handler: Handler): void {
  AUTH_ROUTES.push({ method, pattern, handler });
}

function matchPath(pattern: string, url: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const up = url.split('/').filter(Boolean);
  if (pp.length !== up.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(up[i]);
    else if (pp[i] !== up[i]) return null;
  }
  return params;
}

authRoute('POST', '/api/auth/register', async (_req, res, _p, body) => {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim().slice(0, 20) || username;
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new ApiError(400, '用户名需 3-30 位小写字母/数字/下划线');
  if (password.length < 6) throw new ApiError(400, '密码至少 6 位');
  const exist = await db().prepare('SELECT id FROM gt_users WHERE username = ?').get(username);
  if (exist) throw new ApiError(409, '用户名已被占用');
  const out = await createUser({ username, password, nickname });
  json(res, 200, out);
});

authRoute('POST', '/api/auth/login', async (_req, res, _p, body) => {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const row = await db().prepare('SELECT id, username, nickname, avatar_color, bio, avatar_url, password_hash FROM gt_users WHERE username = ?').get(username);
  if (!row || !verifyPassword(password, row.password_hash)) throw new ApiError(401, '用户名或密码不正确');
  const token = await issueSession(row.id);
  json(res, 200, { token, user: publicUser(row) });
});

authRoute('POST', '/api/auth/guest', async (_req, res) => {
  const out = await createUser({ username: null, nickname: '旅行者' });
  json(res, 200, out);
});

authRoute('GET', '/api/auth/me', async (req, res) => {
  const user = await requireUser(req);
  json(res, 200, { user: publicUser(user) });
});

authRoute('POST', '/api/auth/logout', async (req, res) => {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) await db().prepare('DELETE FROM gt_sessions WHERE token = ?').run(token);
  json(res, 200, { ok: true });
});

/** 供 index.ts 前置调用：命中认证路由返回 true。公开端点在此限速。 */
export async function handleWebAuth(req: IncomingMessage, res: any): Promise<boolean> {
  const url = (req.url || '/').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();
  for (const r of AUTH_ROUTES) {
    if (r.method !== method) continue;
    const params = matchPath(r.pattern, url);
    if (!params) continue;
    if (method === 'POST' && !url.startsWith('/api/auth/logout')) rateLimit(ipOf(req));
    const body = method === 'GET' ? undefined : await readBody(req);
    await r.handler(req, res, params, body);
    return true;
  }
  return false;
}

function ipOf(req: IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
}
