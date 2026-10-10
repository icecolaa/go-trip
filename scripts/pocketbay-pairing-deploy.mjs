/* PocketBay 配对部署（免配对窗口关闭后走此通道，2026-10-10）。
 * 流程：POST /api/deploy/sessions 建会话 → 用户在 pairing_url 网页确认 →
 *       wait 轮询 authorized → upload → status 轮询到 running。
 * 用法：node scripts/pocketbay-pairing-deploy.mjs <tarball> [项目名=gotrip]
 * 前提：~/.pocketbay/credentials.json（读既有 device token 做身份）。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tarball = process.argv[2];
const project = process.argv[3] || 'gotrip';
if (!tarball) { console.error('用法：node scripts/pocketbay-pairing-deploy.mjs <tarball> [project]'); process.exit(1); }

const credPath = process.env.POCKETBAY_CREDENTIALS || path.join(os.homedir(), '.pocketbay', 'credentials.json');
const creds = existsSync(credPath) ? JSON.parse(readFileSync(credPath, 'utf8')) : {};
const deviceToken = creds['https://pocketbay.com']?._device?.token || '';
const API = 'https://pocketbay.com';

const buf = readFileSync(tarball);

/** 网络健壮 fetch：代理波动常见（Cloudflare 连接超时实测），重试 3 次带退避 */
async function fetchRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw lastErr;
}

/* 1. 创建配对会话 */
const sessionRes = await fetchRetry(`${API}/api/deploy/sessions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(deviceToken ? { Authorization: `Bearer ${deviceToken}` } : {}),
  },
  body: JSON.stringify({
    suggested_name: project,
    agent_label: 'ZCode (GoTrip)',
    client_ide: 'zcode',
    client_llm: 'glm',
    upload_mode: 'package',
    config_files: [],
    product_candidates: [{ id: project, kind: 'existing' }],
    database_facts: {
      kind: 'managed_postgres',
      note: '使用平台托管 PostgreSQL，应用读平台注入的 DATABASE_URL（服务端启动自动建表，无需迁移 dump）',
    },
  }),
});
const session = await sessionRes.json().catch(() => ({}));
console.log(`HTTP ${sessionRes.status}`, JSON.stringify({ ...session, device_secret: session.device_secret ? '***' : undefined }));
if (!sessionRes.ok) { console.error('✗ 创建配对会话失败（按响应字段补齐后重试）'); process.exit(1); }

const secret = session.device_secret;
const pairingUrl = session.pairing_url;
if (!secret || !pairingUrl) { console.error('✗ 响应缺 device_secret/pairing_url'); process.exit(1); }

/* 2. 展示授权链接（协议要求：单独一条、正文仅裸 URL） */
console.log('\n=== 请在浏览器打开以下链接完成配对确认 ===');
console.log(pairingUrl);
console.log('=== 网页上点完即可，无需回到对话 ===\n');

/* 3. wait 轮询授权 */
let authorized = null;
for (let i = 0; i < 120; i++) {
  try {
    const w = await fetchRetry(`${API}/api/deploy/sessions/wait`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const st = await w.json().catch(() => ({}));
    if (st.status === 'authorized') { authorized = st; break; }
    if (st.status === 'pending' && st.action_required === 'wait_for_interaction') {
      console.log('⟳ 等待你在网页确认…（若页面已过期请告诉我重贴链接）');
    }
  } catch {
    console.log('⟳ 网络波动，继续等待…');
  }
  await new Promise((r) => setTimeout(r, 5000));
}
if (!authorized) { console.error('✗ 等待授权超时（10 分钟）'); process.exit(1); }
console.log(`✓ 已授权 project_slug=${authorized.project_slug || project}`);

/* device_token 落盘（保留其他键） */
if (authorized.device_token) {
  const scope = (creds['https://pocketbay.com'] = creds['https://pocketbay.com'] || {});
  scope._device = scope._device || {};
  scope._device.token = authorized.device_token;
  writeFileSync(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
  console.log('✓ device_token 已写入凭证文件');
}

/* 4. 上传 */
const up = await fetchRetry(`${API}/api/deploy/sessions/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}` },
  body: (() => {
    const fd = new FormData();
    fd.append('name', authorized.project_slug || project);
    fd.append('file', new Blob([buf]), 'gotrip-deploy.tar.gz');
    fd.append('approved_config_paths', JSON.stringify(session.approved_config_paths || []));
    return fd;
  })(),
});
const upBody = await up.json().catch(() => ({}));
console.log(`upload HTTP ${up.status}`, JSON.stringify(upBody).slice(0, 300));
if (!up.ok) process.exit(1);

/* 5. 轮询状态 */
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  let st = {};
  try {
    const s = await fetchRetry(`${API}/api/deploy/sessions/status`, { headers: { Authorization: `Bearer ${secret}` } });
    st = await s.json().catch(() => ({}));
  } catch {
    process.stdout.write(`\r   [${(i + 1) * 5}s] 网络波动，继续轮询…          `);
    continue;
  }
  const line = `next=${st.next_action} proj=${st.project_status}${st.error_category ? ` err=${st.error_category}` : ''}`;
  process.stdout.write(`\r   [${(i + 1) * 5}s] ${line}          `);
  if (st.next_action === 'done' && st.project_status === 'running') {
    console.log('\n✓ 部署完成');
    if (st.success_message) console.log(st.success_message);
    process.exit(0);
  }
  if (st.error_category || st.project_status === 'error') {
    console.log('\n✗ 部署失败：', JSON.stringify(st).slice(0, 500));
    process.exit(1);
  }
}
console.log('\n✗ 轮询超时');
process.exit(1);
