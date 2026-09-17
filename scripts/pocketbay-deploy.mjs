/* PocketBay 免配对部署（可脚本化）：读设备凭证 → multipart 上传 → 轮询到 running
 * 2026-09-17 数据迁移期间按 deployment-pocketbay.md 的手工流程封装，实测可用（部署 #8930/#8931）。
 * 用法：
 *   node scripts/pocketbay-deploy.mjs <tarball> [项目名=gotrip]
 * 前提：~/.pocketbay/credentials.json 有 ["https://pocketbay.com"]._device.token；
 * 打包命令与排除清单见 docs/deployment-pocketbay.md（必须排除 .env）。 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tarball = process.argv[2];
const project = process.argv[3] || 'gotrip';
if (!tarball) {
  console.error('用法：node scripts/pocketbay-deploy.mjs <tarball> [project]');
  process.exit(1);
}

const credPath = process.env.POCKETBAY_CREDENTIALS || path.join(os.homedir(), '.pocketbay', 'credentials.json');
const creds = JSON.parse(readFileSync(credPath, 'utf8'));
const token = creds['https://pocketbay.com']?._device?.token;
if (!token) { console.error(`✗ ${credPath} 缺 ["https://pocketbay.com"]._device.token`); process.exit(1); }

const buf = readFileSync(tarball);
const fd = new FormData();
fd.append('name', project);
fd.append('file', new Blob([buf]), 'gotrip-deploy.tar.gz');
fd.append('approved_config_paths', '[]');

console.log(`⟳ 上传 ${tarball}（${(buf.length / 1024 / 1024).toFixed(2)}MB）→ pocketbay.com …`);
const res = await fetch('https://pocketbay.com/api/ai/deploy', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
});
const body = await res.json().catch(() => ({}));
console.log(`   HTTP ${res.status}`, JSON.stringify(body).slice(0, 300));
if (!res.ok) process.exit(1);

console.log('⟳ 轮询部署状态…');
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await fetch(`https://pocketbay.com/api/ai/projects/${project}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const st = await s.json().catch(() => ({}));
  const status = st.project_status || st.status || '?';
  process.stdout.write(`\r   [${(i + 1) * 5}s] ${status}${st.error_category ? ` err=${st.error_category}` : ''}          `);
  if (status === 'running') { console.log('\n✓ running'); process.exit(0); }
  if (status === 'error' || st.error_category) {
    console.log('\n✗ 部署失败：', JSON.stringify(st).slice(0, 400));
    process.exit(1);
  }
}
console.log('\n✗ 超时（10 分钟）');
process.exit(1);
