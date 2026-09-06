import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.ts';
import { handleApi } from './routes.ts';
import { attachWs } from './ws.ts';
import { json, ApiError } from './util.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PocketBay 等托管平台通过 PORT 注入端口；GOTRIP_PORT 为本地部署的备用变量
const PORT = Number(process.env.PORT) || Number(process.env.GOTRIP_PORT) || 8787;

await initDb();

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
      json(res, 200, { ok: true });
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

server.listen(PORT, () => {
  console.log('');
  console.log('  🧭 GoTrip 出发吧 · 服务已启动');
  console.log(`  ➜ http://localhost:${PORT}`);
  console.log(`  ➜ 演示账号 demo / demo1234`);
  console.log('');
});
