import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { getUserByToken, tokenFromRequest } from './auth.ts';
import { db, dbReady } from './db.ts';
import type { WsClientMessage } from '../../shared/types.ts';

interface Ctx {
  ws: WebSocket;
  userId: number;
  travelId: number;
  nickname: string;
  trips: Set<number>;
  alive: boolean;
}

const wss = new WebSocketServer({ noServer: true });
const clients = new Set<Ctx>();
// tripId -> Set<userId>（在线成员）
const presence = new Map<number, Set<number>>();

export function attachWs(server: Server): void {
  server.on('upgrade', async (req: IncomingMessage, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    if (!dbReady()) {
      // 建表还没完成，查 token 会打到空句柄；拒绝升级而不是抛错把进程带崩
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    const user = await getUserByToken(tokenFromRequest(req));
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      const ctx: Ctx = { ws, userId: user.id, travelId: user.travelId, nickname: user.nickname, trips: new Set(), alive: true };
      clients.add(ctx);
      ws.on('pong', () => { ctx.alive = true; });
      ws.on('message', raw => {
        try {
          const msg = JSON.parse(String(raw)) as WsClientMessage;
          handle(ctx, msg).catch(e => console.error('[ws] handle:', e?.message || e));
        } catch { /* 忽略非法消息 */ }
      });
      ws.on('close', () => {
        clients.delete(ctx);
        for (const tripId of ctx.trips) {
          leaveRoom(tripId, ctx.userId);
        }
      });
      send(ctx, { type: 'hello', userId: user.id });
    });
  });

  // 心跳：清理断开的连接
  const interval = setInterval(() => {
    for (const ctx of clients) {
      if (!ctx.alive) {
        ctx.ws.terminate();
        continue;
      }
      ctx.alive = false;
      try { ctx.ws.ping(); } catch { /* ignore */ }
    }
  }, 15000);
  interval.unref();
}

async function handle(ctx: Ctx, msg: WsClientMessage): Promise<void> {
  switch (msg.type) {
    case 'subscribe': {
      if (!await isMember(msg.tripId, ctx.userId)) return;
      ctx.trips.add(msg.tripId);
      joinRoom(msg.tripId, ctx.userId);
      broadcastPresence(msg.tripId);
      break;
    }
    case 'unsubscribe': {
      ctx.trips.delete(msg.tripId);
      leaveRoom(msg.tripId, ctx.userId);
      broadcastPresence(msg.tripId);
      break;
    }
    case 'heartbeat':
      ctx.alive = true;
      break;
    case 'location': {
      if (!await isMember(msg.tripId, ctx.userId)) return;
      await db().prepare('UPDATE trip_members SET location_lat = ?, location_lng = ?, location = ?, location_at = ? WHERE trip_id = ? AND user_id = ?')
        .run(msg.lat, msg.lng, msg.city || null, new Date().toISOString(), msg.tripId, ctx.userId);
      broadcastToTrip(msg.tripId, {
        type: 'location', tripId: msg.tripId, memberId: 0, lat: msg.lat, lng: msg.lng, city: msg.city, at: new Date().toISOString(),
      }, ctx.userId);
      break;
    }
  }
}

async function isMember(tripId: number, userId: number): Promise<boolean> {
  const row = await db().prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);
  return !!row;
}

function joinRoom(tripId: number, userId: number): void {
  let set = presence.get(tripId);
  if (!set) {
    set = new Set();
    presence.set(tripId, set);
  }
  set.add(userId);
}

function leaveRoom(tripId: number, userId: number): void {
  const set = presence.get(tripId);
  if (!set) return;
  set.delete(userId);
  if (!set.size) presence.delete(tripId);
}

export function onlineMemberIds(tripId: number): number[] {
  return [...(presence.get(tripId) || [])];
}

function broadcastPresence(tripId: number): void {
  broadcastToTrip(tripId, { type: 'presence', tripId, onlineMemberIds: onlineMemberIds(tripId) });
}

function send(ctx: Ctx, data: unknown): void {
  if (ctx.ws.readyState === WebSocket.OPEN) {
    ctx.ws.send(JSON.stringify(data));
  }
}

/** 房间内广播（跳过指定用户，用于 location 消息避免回声） */
export function broadcastToTrip(tripId: number, data: unknown, skipUserId?: number): void {
  for (const ctx of clients) {
    if (skipUserId != null && ctx.userId === skipUserId) continue;
    if (ctx.trips.has(tripId)) send(ctx, data);
  }
}
