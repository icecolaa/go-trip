# PocketBay 部署与运维手册

本文面向需要把 GoTrip 部署到 PocketBay 平台、或排查线上问题的人。截至 2026-09-10 的生产现状：

- 线上地址：`https://gotrip.pocketbay.app`（项目 slug `gotrip`，PocketBay 项目 #1496）
- 数据库：平台托管 PostgreSQL，应用读平台注入的 `DATABASE_URL`（TLS 连接，禁止 `sslmode=disable`）
- 平台手册：部署 <https://pocketbay.com/deploy>，数据库 <https://pocketbay.com/database>

## 生产环境变量（平台控制台维护）

| 变量 | 状态 | 用途 |
|---|---|---|
| `DATABASE_URL` | 平台自动注入 | 托管 PostgreSQL 连接串 |
| `GOTRIP_AMAP_KEY` | 已配置（用户在控制台添加） | 高德 POI 搜索 |
| `GOTRIP_AI_BASE_URL` / `GOTRIP_AI_API_KEY` / `GOTRIP_AI_MODEL` | 智谱 GLM（OpenAI 兼容） | AI 行程规划 / 使用助手 |
| `FLYAI_API_KEY` | 2026-09-10 已配置 | 飞哪儿机票搜索 |

**密钥只存在两处**：本地 `.env`（已 gitignore）与 PocketBay 控制台。**不要**把 `.env` 打进部署包：免配对部署接口会拒绝（实测 2026-09-10 报 `config_policy_violation`，`approved_config_paths` 传 `[".env"]`、`["./.env"]` 或两者同批均被拒）；手册指引携带配置须走「配对页确认」，比控制台添加麻烦得多，不推荐。

## 部署流程（免配对路径）

前提：`~/.pocketbay/credentials.json` 存在 `["https://pocketbay.com"]._device.token`（结构见平台手册；同级其它键是项目缓存，勿删）。

1. 打包（在仓库根目录，**必须排除 `.env`**）：

   ```bash
   tar --exclude='.git' --exclude='node_modules' --exclude='client/dist' \
       --exclude='server/data' --exclude='.pocketbay' --exclude='.env' \
       -czf /tmp/gotrip-deploy.tar.gz .
   ```

2. 上传（multipart：`name`、`file`、`approved_config_paths` 传 `'[]'`；已脚本化：`node scripts/pocketbay-deploy.mjs <tarball>`——读凭证、FormData、`POST https://pocketbay.com/api/ai/deploy`、自动轮询到 running，2026-09-17 迁移期间实测 #8930/#8931）。
3. 轮询 `GET /api/ai/projects/gotrip/status`（同一 token）到 `project_status == "running"`，再报告成功。失败时按响应里的 `error_category` / `repair_hint` 处理，常见：`config_policy_violation` → 检查包里是否混入 `.env`；413 → 减包；429 → 遵守 `Retry-After`。
4. 健康检查：`GET /health` 返回 `{"ok":true,"db":"ready","driver":"postgres"}`（`/api/health` **不是**路由，会返回 `{"error":"接口不存在"}`，但这也证明服务在线）。数据库尚未连上时 `/health` 仍回 200，body 为 `{"ok":false,"db":"starting","attempts":n,"lastError":"…"}`，`/api` 回 503（见 CLAUDE.md「启动顺序不可倒置」）。

## 部署后验证清单

```bash
curl -s https://gotrip.pocketbay.app/health                          # {"ok":true}
# 登录拿 token（demo / demo1234）
curl -s -X POST https://gotrip.pocketbay.app/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"demo","password":"demo1234"}'
# 飞哪儿双人数回归（缓存键修复的验收动作，2026-09-10 起纳入）：
# 同一出发/日期分别传 passengers=9 与 passengers=2，
# 断言各自 totalPrice == perPerson × N，两次结果互不影响
```

## 休眠与保活

PocketBay 免费托管闲置会回收实例，下次访问需在平台页点「唤醒并继续」（10~30 秒）。这是平台机制，应用侧无法关闭。使用期间可跑保活脚本：

```bash
node scripts/keepalive.mjs   # 默认每 4 分钟心跳一次，Ctrl+C 停止
```

### 判断「是睡了还是挂了」（2026-09-19 实测）

- 休眠时应用域名一律回 **204 空响应**（`Server: cloudflare` + `x-pb-project`），POST 会被换成 403 的 `pb-shell` 挑战页（带 `pb_hs` cookie）。用浏览器 UA 也一样。
- **脚本请求首页并不能触发唤醒**（连打 75 秒仍是 204）；唤醒靠**浏览器打开 `https://gotrip.pocketbay.app`**——2026-10-12 实测平台已改为**开页自动唤醒**（显示「正在唤醒应用…就绪后自动进入」进度横幅，10~30 秒后自动进应用），无需再手动点「唤醒并继续」按钮。
- 平台 API 不受休眠影响，可直接确认状态与最新部署号：

  ```bash
  node -e "const t=require(process.env.USERPROFILE+'/.pocketbay/credentials.json')['https://pocketbay.com']._device.token;
  fetch('https://pocketbay.com/api/ai/projects',{headers:{Authorization:'Bearer '+t}}).then(r=>r.json())
    .then(j=>{const g=j.find(p=>p.slug==='gotrip');console.log(g.status,'deployment',g.current_deployment_id,'slept_at',g.slept_at,'autosleep',g.autosleep_enabled)})"
  ```

  `project_status` 取值：`sleeping`（回收，需人工唤醒）/ `running`；`latest_deployment.status` 是构建结果，与服务是否在线无关。
  没有 wake/resume 类接口（`/wake`、`/resume`、`/start`、`/keepalive` 实测均 404），`autosleep_enabled` 字段存在但接口未提供改它的入口。

## 数据库注意

- 托管 PG 由平台注入 `DATABASE_URL`，**本地 `.env` 不要写这个变量**，避免覆盖平台注入值。
- 启动时自动建表 + 种子（双方言 DDL，见 `server/src/db.ts`）；PG 迁移语句必须 `await` 顺序执行（历史上 `return` 导致迁移死代码、线上缺表 500，见 HANDOFF §事故记录）。
- 免配对部署路径不支持迁移数据库结构/数据（那需要配对页），但本项目启动时自动迁移，无需平台侧 dump。
