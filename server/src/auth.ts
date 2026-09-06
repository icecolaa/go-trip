import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from './db.ts';
import { randomToken, ApiError } from './util.ts';

/** scrypt 口令哈希：salt:hash 十六进制 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SessionUser {
  id: number;
  travelId: number;
  username: string;
  nickname: string;
  avatarColor: string;
  bio: string;
}

export function createSession(userId: number): string {
  const token = randomToken();
  db().prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)')
    .run(token, userId, new Date().toISOString());
  return token;
}

export function destroySession(token: string): void {
  db().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getUserByToken(token: string): SessionUser | null {
  if (!token) return null;
  const row = db().prepare(
    'SELECT u.id, u.travel_id, u.username, u.nickname, u.avatar_color, u.bio FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token) as any;
  if (!row) return null;
  return { id: row.id, travelId: row.travel_id, username: row.username, nickname: row.nickname, avatarColor: row.avatar_color, bio: row.bio };
}

export function tokenFromRequest(req: IncomingMessage): string {
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  const url = req.url || '';
  const m = url.match(/[?&]token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export function requireAuth(req: IncomingMessage): SessionUser {
  const user = getUserByToken(tokenFromRequest(req));
  if (!user) throw new ApiError(401, '请先登录');
  return user;
}

/** 分配一个未占用的 6 位旅行 ID */
export function allocateTravelId(): number {
  const d = db();
  for (let i = 0; i < 200; i++) {
    const id = 100000 + Math.floor(Math.random() * 900000);
    const exists = d.prepare('SELECT 1 FROM users WHERE travel_id = ?').get(id);
    if (!exists) return id;
  }
  const max = d.prepare('SELECT MAX(travel_id) AS m FROM users').get() as any;
  return Number(max.m || 100000) + 1;
}

export function setAuthCookie(res: ServerResponse, token: string): void {
  res.setHeader('Set-Cookie', `gotrip_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

export function clearAuthCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', 'gotrip_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}
