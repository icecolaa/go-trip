/**
 * 小程序代码上传 / 预览（双通道，2026-09-26）
 *
 * 通道 A（优先）：微信开发者工具 HTTP 服务接口——发布者显示为工具登录的账号（个人昵称）。
 *   前提：开发者工具在运行，且 设置→安全→服务端口 已开启（端口写在 ~/.ide 文件里）。
 * 通道 B（自动降级）：miniprogram-ci + 上传密钥——免开工具，但后台显示「ci机器人N发布」。
 *
 * 用法：
 *   npm run preview                 生成预览二维码（preview-qr.jpg，微信扫码打开体验）
 *   npm run upload -- 1.0.0         上传为开发版本（版本号必填）
 *   npm run upload -- 1.0.0 "描述"  带版本描述
 *
 * 前置（通道 B）：private.<appid>.key 上传密钥已放在本目录（.gitignore 保护，绝不提交）。
 * 上传后到公众平台「版本管理 → 开发版本」设为体验版或提交审核。
 */
const path = require('path')
const fs = require('fs')
const http = require('http')

const root = path.resolve(__dirname, '..')
const pc = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const keyPath = path.join(root, `private.${pc.appid}.key`)

const argv = process.argv.slice(2)
const mode = argv[0] === 'preview' ? 'preview' : 'upload'
const version = mode === 'upload' ? argv[0] : undefined
const desc = mode === 'upload' ? (argv[1] || '') : (argv[1] || 'GoTrip 小程序预览')

if (mode === 'upload' && (!version || !/^\d+\.\d+\.\d+/.test(version))) {
  console.error('✗ 请提供语义化版本号：npm run upload -- 1.0.0 "描述"')
  process.exit(1)
}

/* ---------- 通道 A：开发者工具 HTTP 服务 ---------- */

/** 读服务端口：环境变量优先，其次扫描各 profile 的 .ide 端口文件（User Data/<hash>/Default/.ide）。 */
function devtoolsPort() {
  if (process.env.WECHAT_DEVTOOLS_PORT) return Number(process.env.WECHAT_DEVTOOLS_PORT)
  const base = path.join(process.env.LOCALAPPDATA || '', '微信开发者工具', 'User Data')
  try {
    for (const dir of fs.readdirSync(base)) {
      try {
        const raw = fs.readFileSync(path.join(base, dir, 'Default', '.ide'), 'utf8').trim()
        const port = Number(raw)
        if (port > 0 && port < 65536) return port
      } catch { /* 该 profile 没有 .ide 换下一个 */ }
    }
  } catch { /* User Data 目录不存在 */ }
  return 0
}

function devtoolsRequest(port, apiPath, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: apiPath, timeout: timeoutMs }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ ok: res.statusCode === 200, body }))
    })
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, body: 'timeout' }) })
    req.on('error', (e) => resolve({ ok: false, body: e.message }))
  })
}

async function uploadViaDevtools() {
  const port = devtoolsPort()
  if (!port) return { ok: false, reason: '未找到开发者工具服务端口（工具未运行或服务端口未开启）' }
  // 先验证登录态，再上传（v2 接口 UTF-8 参数用 URL 编码，绕开 Windows 命令行 GBK 坑）
  const login = await devtoolsRequest(port, `/v2/islogin`, 8000)
  if (!login.ok || !/"(is)?login"\s*:\s*true/.test(login.body)) {
    return { ok: false, reason: '开发者工具未登录（打开工具扫码登录后重试）' }
  }
  const qs = `project=${encodeURIComponent(root)}&version=${encodeURIComponent(version)}&desc=${encodeURIComponent(desc)}`
  const up = await devtoolsRequest(port, `/v2/upload?${qs}`, 300000) // 上传含编译，放宽到 5 分钟
  if (!up.ok) return { ok: false, reason: `工具接口返回异常：${up.body.slice(0, 120)}` }
  let parsed
  try { parsed = JSON.parse(up.body) } catch { parsed = null }
  // 成功响应形如 {"info":{...},"success":true}（无 code 字段）；失败才是 {"code":N,"message":...}
  if (parsed && parsed.success === true) return { ok: true }
  if (parsed && parsed.code != null && Number(parsed.code) !== 0) {
    return { ok: false, reason: `工具上传失败：${(parsed.message || up.body).slice(0, 160)}` }
  }
  return { ok: true }
}

/* ---------- 通道 B：miniprogram-ci ---------- */

function uploadViaCi() {
  // 白名单只收 IPv4：强制本进程 DNS 走 v4 优先（否则可能从 IPv6 出口被 -10008 拒）
  try { require('dns').setDefaultResultOrder('ipv4first') } catch { /* 旧 Node 无此 API */ }
  if (!fs.existsSync(keyPath)) {
    console.error(`✗ 找不到上传密钥：${keyPath}`)
    console.error('  在公众平台「开发管理 → 开发设置 → 小程序代码上传」下载，放到 miniprogram/ 目录。')
    process.exit(1)
  }
  const ci = require('miniprogram-ci')
  const project = new ci.Project({
    appid: pc.appid,
    type: 'miniProgram',
    projectPath: root,
    privateKeyPath: keyPath,
    ignores: ['node_modules/**/*', 'src/**/*', 'config/**/*', 'scripts/**/*'],
  })
  return mode === 'preview'
    ? ci.preview({
        project,
        desc,
        setting: { es6: false, es7: true, minify: true },
        qrcodeFormat: 'image',
        qrcodeOutputDest: path.join(root, 'preview-qr.jpg'),
      }).then(() => {
        console.log('✓ 预览二维码已生成：miniprogram/preview-qr.jpg')
      })
    : ci.upload({
        project,
        version,
        desc,
        setting: { es6: false, es7: true, minify: true },
        robot: 1, // 后台将显示「ci机器人1发布」
      }).then(() => {
        console.log(`✓ 上传成功：${version}（发布者：ci机器人1）`)
        console.log('  前往公众平台「版本管理 → 开发版本」设为体验版或提交审核。')
      })
}

async function main() {
  if (mode === 'upload') {
    console.log(`⟳ 上传开发版本 ${version}（优先开发者工具通道，发布者=工具登录账号）…`)
    const a = await uploadViaDevtools()
    if (a.ok) {
      console.log(`✓ 上传成功：${version}（发布者：开发者工具登录账号）`)
      console.log('  前往公众平台「版本管理 → 开发版本」设为体验版或提交审核。')
      return
    }
    console.log(`⟳ 开发者工具通道不可用（${a.reason}），降级 miniprogram-ci…`)
  }
  await uploadViaCi()
}

main().catch((e) => {
  console.error('✗ 失败：', (e && e.message) || e)
  process.exit(1)
})
