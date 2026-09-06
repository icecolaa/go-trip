// WebSocket 广播冒烟测试：登录 demo → 建临时行程 → WS 订阅 → 修改预算 → 断言收到 change 广播
// 用法：node scripts/ws-test.mjs   （可用 GOTRIP_TEST_BASE 覆盖服务地址）
import WebSocket from 'ws';

const BASE = process.env.GOTRIP_TEST_BASE || 'http://localhost:8787';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: '{"username":"demo","password":"demo1234"}',
}).then(r => r.json());
const token = login.token;

const trip = await fetch(BASE + '/api/trips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: '{"title":"WS冒烟测试行程","destination":"北京","startDate":"2026-10-01","endDate":"2026-10-02"}',
}).then(r => r.json());

const ws = new WebSocket(`ws://${new URL(BASE).host}/ws?token=${token}`);
let received = null;
ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.type === 'change') received = m;
});
ws.on('error', e => { console.error(`WS_ERROR ${e.code || ''} ${e.message}`.trim()); process.exit(1); });
await new Promise(r => ws.on('open', r));
ws.send(JSON.stringify({ type: 'subscribe', tripId: trip.id }));
await new Promise(r => setTimeout(r, 400)); // 等订阅在服务端注册完成

await fetch(`${BASE}/api/trips/${trip.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: '{"budget":1234}',
});
await new Promise(r => setTimeout(r, 800));

console.log(received && received.entity === 'trip' ? `WS_CHANGE_OK entity=${received.entity}` : 'WS_NO_MESSAGE');
ws.close();
await fetch(`${BASE}/api/trips/${trip.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
// 留出关闭窗口，避免 Windows 下 process.exit 触发 libuv 断言
setTimeout(() => process.exit(0), 200);
