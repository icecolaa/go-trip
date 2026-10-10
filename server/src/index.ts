import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './routes.ts';
import { handleWebAuth } from './webauth.ts';
import { handleWebData } from './webdata.ts';
import { ensureSchema, dbDriver } from './db.ts';
import { json, ApiError } from './util.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PocketBay 等托管平台通过 PORT 注入端口；GOTRIP_PORT 为本地部署的备用变量
const PORT = Number(process.env.PORT) || Number(process.env.GOTRIP_PORT) || 8787;

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

// CORS：H5 静态托管跨域直连云托管公网域名时需要（阶段二 Web 切 rdb 前暂用）。
const CORS_ALLOW = (process.env.CORS_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin) {
    const allowed = CORS_ALLOW.length > 0
      ? CORS_ALLOW.includes(origin)
      : origin.endsWith('.tcloudbaseapp.com') || origin.endsWith('.wxcloudrun.com');
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

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

/* ---------- 数据库就绪：后台建表（平台 PG 可能晚于应用就绪），/health 反映状态 ---------- */
let dbReady = false;
let dbError = '';
void (async () => {
  for (let i = 0; i < 30 && !dbReady; i++) {
    try {
      await ensureSchema();
      dbReady = true;
      console.log(`  🗄️ 数据库就绪（${dbDriver()}）`);
    } catch (e: any) {
      dbError = e?.message || String(e);
      console.error(`  ⏳ 数据库暂不可用（第 ${i + 1} 次）：${dbError}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
})();

const server = http.createServer(async (req, res) => {
  if (applyCors(req, res)) return;
  const url = req.url || '/';
  try {
    if (url === '/health' || url === '/healthz') {
      json(res, 200, dbReady
        ? { ok: true, db: dbDriver(), mode: 'fullstack' }
        : { ok: false, db: 'starting', lastError: dbError });
      return;
    }
    if (url.startsWith('/api/auth/')) {
      const handled = await handleWebAuth(req, res);
      if (!handled) json(res, 404, { error: '接口不存在' });
      return;
    }
    if (url.startsWith('/api/data/')) {
      if (!dbReady) { json(res, 503, { error: '数据库尚在初始化，请稍后重试' }); return; }
      await handleWebData(req, res);
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

server.listen(PORT, () => {
  console.log('');
  console.log('  🧭 GoTrip 出发吧 · 全栈服务（Web 数据走内置 PG/SQLite 数据层）');
  console.log(`  ➜ http://localhost:${PORT}`);
  console.log('');
});
