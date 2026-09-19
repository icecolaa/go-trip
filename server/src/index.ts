import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, dbReady, dbBootStatus, dbDriver } from './db.ts';
import { handleApi } from './routes.ts';
import { attachWs } from './ws.ts';
import { json, ApiError } from './util.ts';
import { readUpload } from './uploads.ts';
import { purgeExpiredSessions } from './auth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PocketBay 等托管平台通过 PORT 注入端口；GOTRIP_PORT 为本地部署的备用变量
const PORT = Number(process.env.PORT) || Number(process.env.GOTRIP_PORT) || 8787;

// 数据库在后台初始化（失败按退避重试，见 db.ts 就绪状态注释）：端口必须先监听，
// 否则云托管内置 MySQL 唤醒期间容器会被判为不健康反复重启，公网域名整段 504。
void initDb().catch((e) => console.error('[db] 启动循环意外退出（接口将一直 503）：', e?.message || e));

const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = (req.url || '/').split('?')[0];
  if (!existsSync(CLIENT_DIST)) return false;
  let filePath = path.join(CLIENT_DIST, url === '/' ? 'index.html' : url.slice(1));
  if (!filePath.startsWith(CLIENT_DIST)) return false;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA 回退到 index.html
    filePath = path.join(CLIENT_DIST, 'index.html');
    if (!existsSync(filePath)) return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const cacheable = url.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(readFileSync(filePath));
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  try {
    if (url === '/health' || url === '/healthz') {
      // 永远 200：平台按状态码判定实例健康，503 会让冷启动期间一直被重启。
      // 是否真的可用看 body 的 ok / db 字段（ok:false + db:"starting" = 数据库还没就绪）。
      if (dbReady()) json(res, 200, { ok: true, db: 'ready', driver: dbDriver() });
      else {
        const boot = dbBootStatus();
        json(res, 200, {
          ok: false, db: 'starting', attempts: boot.attempts,
          lastError: boot.lastError.slice(0, 200),
        });
      }
      return;
    }
    // 数据库未就绪：接口一律 503，不能让请求打到还没建表的 db()。
    // 静态资源放行——托管平台若用首页做探针，503 会被误判成实例故障。
    if (!dbReady() && (url.startsWith('/api/') || url.startsWith('/uploads/'))) {
      json(res, 503, { error: '服务启动中（数据库连接未就绪），请稍后重试' });
      return;
    }
    if (url.startsWith('/uploads/')) {
      const file = readUpload(url.slice('/uploads/'.length).split('?')[0]);
      if (!file) return void json(res, 404, { error: 'Not Found' });
      res.writeHead(200, { 'Content-Type': file.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.end(file.buf);
      return;
    }
    if (url.startsWith('/api/')) {
      const handled = await handleApi(req, res);
      if (!handled) json(res, 404, { error: '接口不存在' });
      return;
    }
    if (serveStatic(req, res)) return;
    json(res, 404, { error: 'Not Found' });
  } catch (e: any) {
    if (e instanceof ApiError) json(res, e.status, { error: e.message });
    else {
      console.error('[server]', e);
      json(res, 500, { error: '服务器内部错误' });
    }
  }
});

attachWs(server);

// 定期清理过期会话行（校验在 getUserByToken 里做，这里只负责删数据控表体积）
setInterval(() => { purgeExpiredSessions().catch(() => undefined); }, 6 * 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log('');
  console.log('  🧭 GoTrip 出发吧 · 服务已启动');
  console.log(`  ➜ http://localhost:${PORT}`);
  console.log(`  ➜ 演示账号 demo / demo1234`);
  console.log('');
  if (!dbReady()) console.log('  ⟳ 数据库初始化中（接口暂回 503，/health 可见进度）');
});
