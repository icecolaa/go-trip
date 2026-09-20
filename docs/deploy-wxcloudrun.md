# 微信云托管部署指南

把 GoTrip 服务端部署到[微信云托管](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/basic/intro.html)，让小程序通过 `wx.cloud.callContainer` 调用——**免备案、免配置服务器域名白名单**，走微信专线上报，天然携带用户 openid。

本文写于 2026-09-17，对应小程序分支 `feat/miniprogram`。

## 为什么选云托管 / 架构分工

| 通道 | 用途 | 前置条件 |
|---|---|---|
| 云托管 `callContainer` | 小程序全部 HTTP 接口 | 无需备案（微信内网专线） |
| 云托管默认域名 wss | 小程序 WebSocket（协作在线） | 测试期可用，正式建议备案域名 |
| PocketBay（现状不动） | Web 客户端 `gotrip.pocketbay.app` | — |

小程序上线本来要求 request 合法域名是**已备案域名**；走 callContainer 可完全绕开这一步，这是选云托管的核心原因。注意 callContainer 不支持长连接，WebSocket 仍需走域名直连（见下文「已知约束」）。

## 关键设计决策：数据库用内置 MySQL

云托管实例**缩容到 0 时容器会被销毁**，容器文件系统是临时的——本地 SQLite（`/app/server/data/gotrip.db`）在云托管上会丢数据，**不可用**。

服务端为此已支持三种数据库驱动（`server/src/db.ts`，按环境变量自动选择）：

| 环境变量 | 驱动 | 场景 |
|---|---|---|
| 不设置 | SQLite | 本地开发 |
| `DATABASE_URL` | PostgreSQL | PocketBay 部署 |
| `MYSQL_ADDRESS` | **MySQL（mysql2 连接池）** | **云托管** |

云托管控制台开通内置 MySQL 后，平台自动向同环境服务注入 `MYSQL_ADDRESS`（host:port）、`MYSQL_USERNAME`、`MYSQL_PASSWORD`，服务启动时自动**建库（gotrip）建表种子数据**，零手工操作。

### 内置 MySQL 的版本约束（踩过的坑，写代码前先对一遍）

- **实测低于 8.0.13**：`gotrip-013` 的启动日志实锤——`images MEDIUMTEXT NOT NULL DEFAULT ('[]')` 报 1064（表达式默认值 8.0.13 才有），建表停在那里，容器永远起不来。本机 `mysql:5.7.44` 复现出逐字相同的报错、`mysql:8.4.11` 则合法（2026-09-20）。
- 所以 MySQL 方言里**不要写**：表达式默认值 `DEFAULT (…)`、`CHECK` 约束、窗口函数/CTE、`JSON` 列类型、`utf8mb4_0900_*` 排序规则。JSON 一律存 TEXT 字符串，NOT NULL 列靠「INSERT 显式列全」保证（历史事故：种子漏 `images` 列 → 严格模式 1364 → 种子残缺）。
- 启动日志会打印 `服务端版本 x.y.z` 与 `种子数据：空库…/跳过（已有 N 个用户）`，这两行是判读云库状态的第一手依据；本机复现方式见 HANDOFF 条目 36（`docker run -p 3391:3306 -e MYSQL_ROOT_PASSWORD=… mysql:5.7` + `MYSQL_ADDRESS=127.0.0.1:3391` 起服务，`bash scripts/smoke.sh` 99/0、`work/migration/e2e-*.mjs` 36/0）。

## 部署步骤

### 0. 前置条件

- 已有小程序 AppID `wxea1150ef589e225f`（你已完成）
- 微信开发者工具 / 小程序管理后台可登录
- 仓库代码（本分支已含全部所需改动）

### 1. 开通云托管环境

1. 打开 [微信云托管控制台](https://cloud.weixin.qq.com/)，用小程序关联微信扫码开通。
2. 选择「按量付费」，地域建议**上海**（与微信服务器链路最优），创建环境，记下**环境 ID**（形如 `gotrip-8g0xxxx`，小程序端要用）。

### 2. 开通内置 MySQL

控制台左侧「数据库管理 → MySQL」→ 开通（Serverless 版，有免费额度）。开通后不需要手动建库建表——服务首次启动会自动完成。

### 3. 创建服务 gotrip

控制台「服务列表 → 新建服务」：

- 服务名称：`gotrip`（**必须**，小程序端 `WX_SERVICE` 常量与之对应）
- 备注随意；公网访问开关先开启（便于验证，验证后可关）

### 4. 上传代码并部署（版本配置）

「服务列表 → gotrip → 版本配置 → 新建版本」，部署方式选「本地上传代码包」，代码构建方式选「**使用 Dockerfile 构建**」：

1. 在**仓库根目录**打部署包（Windows Git Bash）。⚠️ 必须 zip 且用 **bsdtar** 打（PowerShell Compress-Archive 会产生反斜杠路径的 zip，云上解压构建直接失败；`.tar.gz` 平台不收）：

   ```bash
   /c/Windows/System32/tar.exe -acf $TEMP/gotrip-cloudrun.zip \
     --exclude=.git --exclude=node_modules --exclude=client/dist \
     --exclude=server/data --exclude=.pocketbay --exclude=.env \
     --exclude=miniprogram/node_modules --exclude=miniprogram/dist \
     --exclude='miniprogram/private.*.key' \
     --exclude=server/src/admin-migrate-token.txt \
     --exclude=work --exclude=.zcode --exclude=data \
     --exclude=miniprogram/.swc --exclude='miniprogram/2b5d6837*' \
     .
   ```

   ⚠️ 红线：**必须排除 `.env` 和上传密钥 `*.key`**（还有本地误生成的根目录 `data/` 数据库与上传图片）；必须在仓库根目录打包（历史上从子目录打包引发过线上缺文件事故 #7587）。打包后抽查：`tar -tf $TEMP/gotrip-cloudrun.zip | grep -iE "\.key|\.env$|^data/"` 应无输出。

2. 上传 `gotrip-cloudrun.tar.gz`（Dockerfile 在仓库根，云托管会自动识别并按其构建多阶段镜像）。
3. 版本配置：
   - **监听端口**：保持默认即可。云托管向容器注入 `PORT` 环境变量，服务端优先读它（`server/src/index.ts`：`Number(process.env.PORT) || GOTRIP_PORT || 8787`）。
   - **CPU/内存**：建议 0.5C / 1G（飞哪儿检索会 spawn 子进程）。
   - **实例副本数**：最小 0（缩容到 0 省钱，接受几秒冷启动）或 1（无冷启动，持续计费）。MVP 建议最小 0。
4. 环境变量（控制台逐条添加，**只存控制台，不进仓库**）：

   | 变量 | 值 | 说明 |
   |---|---|---|
   | `TZ` | `Asia/Shanghai` | 容器默认 UTC，不加会差 8 小时（日期/记账时间） |
   | `GOTRIP_AMAP_KEY` | 高德 Key | POI 搜索 |
   | `GOTRIP_AI_BASE_URL` / `GOTRIP_AI_API_KEY` / `GOTRIP_AI_MODEL` | 智谱 GLM | AI 行程规划/解析 |
   | `FLYAI_API_KEY` | 飞哪儿 Key | 机票检索 |
   | ~~`DATABASE_URL`~~ | **不要设** | 设了会切去 PG，云托管连不上 PocketBay |
   | ~~`GOTRIP_PORT`~~ | **不要设** | 会覆盖平台注入的 `PORT` |

5. 发布版本，等构建完成（首次约 3-5 分钟）。

### 5. 验证服务

- 服务详情页「公网访问地址」打开 `/health`，应返回 `{"ok":true}`。
- 服务详情「运行日志」应出现 `➜ 数据库：MySQL（微信云托管内置）`。
- 控制台「测试」或 curl 默认域名：

  ```bash
  curl -s -X POST https://<默认域名>/api/auth/login \
    -H 'Content-Type: application/json' -d '{"username":"demo","password":"demo1234"}'
  ```

### 6. 小程序端接入 callContainer

1. `miniprogram/src/config.ts` 把 `CLOUD_ENV` 填为第 1 步的环境 ID：

   ```ts
   export const CLOUD_ENV = 'gotrip-8g0xxxx'
   ```

   生产构建即走 callContainer（`USE_CLOUD = !isDev && CLOUD_ENV !== ''`），开发仍直连本机 :8787，互不影响。

2. 重新构建并上传体验版：

   ```bash
   cd miniprogram
   npm run build:weapp
   npm run upload -- 0.2.0 "接入云托管 callContainer"
   ```

   （前提：控制台小程序用户已把出口 IP `222.131.164.61` 加入「开发设置 → IP 白名单」，或临时关闭白名单。）

3. 真机打开体验版验证：登录 → 行程列表 → 打开行程 → 记账/打包清单各写一条。

### 6.5 微信静默登录（无需注册登录）

接好云托管后，小程序用户**无需注册登录**：`callContainer` 请求由微信网关自动注入 `x-wx-openid`，服务端 `POST /api/auth/wechat`（`server/src/routes.ts`）据此找用户/静默注册并签发 Bearer token。行程列表页启动时无 token 会自动走这条链路，失败（如开发直连本机）才兜底到账号密码登录页。

- **静默注册**：username 为 `wx_<openid>`，昵称默认「微信用户」，密码为随机值（等同只能微信登录）；同一 openid 复登返回同一账号。
- **昵称头像**：微信 2022 年起不再下发真实昵称头像，用户在「我的 → 我的资料」页用官方能力主动填一次（`chooseAvatar` 按钮 + `type=nickname` 输入框）；头像压缩为 dataURL 直接入库（走 callContainer JSON 通道，不依赖公网静态文件）。
- **安全边界（重要）**：`x-wx-*` 请求头只在微信专线内网可信，接口会拒绝缺 `x-wx-source` 的调用；但真正的防线是**关闭服务的公网访问**（服务设置 → 公网访问关），否则公网默认域名可被伪造头冒充任意用户。开发期需开公网验证时，验完立刻关掉。
- **本地开发**：直连模式下无 openid 头，静默登录必然 400 → 自动落到登录页，用 demo / demo1234，行为不变。

### 7. WebSocket（协作在线状态）

callContainer 不支持长连接。小程序 WS 走 `WS_BASE` 直连：

- **测试期**：把云托管服务的**默认公网域名**（服务设置里可见，形如 `https://gotrip-<环境ID后缀>.ap-shanghai.run.tcloudbase.com`）的 wss 形式填入 `miniprogram/src/config.ts` 的 `WS_BASE`，并在小程序管理后台「开发设置 → 服务器域名 → socket 合法域名」加上该域名。实测：mp 后台保存 `*.tcloudbase.com` 会显示红字「**云托管域名仅用作测试使用，不可用在正式环境下**」——保存能通过，开发版/体验版可用，**正式版运行时会被拦**。
- **正式期**：绑定已备案自定义域名（服务设置 → 自定义域名，CNAME 接入，HTTPS 证书自动签发），替换 `WS_BASE` 与 socket 合法域名。届时仅「协作在线状态」依赖此步，其余功能走 callContainer 不受影响。
- 开发者工具 `urlCheck: false` 不校验，可直接连。WS 链路验证：向默认域名发升级请求（不带 token），服务端回 401 即代表域名→容器→`/ws` 鉴权整条链路通。

## 已知约束（callContainer 特性决定）

| 约束 | 影响 | 现状/缓解 |
|---|---|---|
| 单次调用超时上限 **15 秒** | 飞哪儿首次检索（spawn 飞猪子进程）可能超时 | 服务端有缓存：首次失败重试即命中缓存；后续优化预热 |
| 返回包上限 **1000KiB** | 行程 bundle 含游记图片（base64 dataURL），图片多了会超 | MVP 量级可控；长期把图片迁对象存储、接口只回 URL |
| 请求体：JSON 对象上限 20MiB | 游记 9 图上传 | 现阶段够用 |
| 基础库需 **≥ 2.23.0** | 低版本无法 callContainer | 管理后台「功能设置 → 基础库最低版本」设为 2.23.0 |
| 缩容到 0 有冷启动 | 首个请求慢几秒 | 接受，或最小实例设 1 |
| 公网关闭后 `<Image>` 无法加载服务端文件 | `/uploads/` 静态图片只能内网取 | 头像/游记均存 dataURL 随 JSON 返回，已规避；未来迁对象存储 |

## 费用

按量付费 + 缩容到 0，MVP 流量基本落在免费额度内（含 MySQL Serverless 额度）。实例配额调高（最小 1）或流量上来后才产生明显费用，控制台可看用量明细。

## 与 PocketBay 的关系

两套部署**数据独立**（PG 与 MySQL 各自建库），互不同步。Web 客户端继续用 PocketBay 不动；小程序用云托管。若日后想合并，两种路径：① 云托管通过外网 `DATABASE_URL` 连 PocketBay PG（PocketBay 休眠时会连带挂，不推荐）；② 做一次数据迁移脚本把 PG 数据导入云托管 MySQL，之后 PocketBay 只跑 Web（共享数据库需绑定备案域名+公网，走防火墙白名单，复杂度高，暂不建议）。

## PocketBay → 云托管 MySQL 数据迁移（2026-09-17 已建通道）

两侧数据库都不对公网开放直连，迁移走应用层，引擎在 `server/src/migrate.ts`（完整说明见文件头注释）。合并策略：

- PocketBay 数据**原样落库**：显式保留 id / 密码哈希 / 时间戳，账号在两侧密码不变；
- 两边各自种子出的演示数据（demo 等 + 种子旅程）以 **PocketBay 版本为准**；
- 云托管独有用户（`wx_<openid>` 静默注册的微信账号）及其名下旅程/成员/记账**平移保留**（id 推到两侧最大值之上，`expenses.participants` 里的成员 id 同步重写）。注意不能按「id 与 dump 重复」判重丢弃——云侧新建旅程 id 几乎必然与 PocketBay 旅程 id 相撞，必须按所有者判；
- 日志/头像引用的 `/uploads/` 图片拉取自 PocketBay 并内联为 dataURL（小程序无法访问对方静态文件；每旅程 600KB base64 预算防超 callContainer 1MiB 限制）；
- 导入前自动把目标库全表备份为容器内 `data/migrate-backup-<时间戳>.json`，写库在单事务内，引用校验失败即中止不写半截。

操作通道（令牌 `server/src/admin-migrate-token.txt`，gitignore 排除，文件不存在时接口一律 404）：

1. **PocketBay 侧（导出）**：基于 master 打一次性包（补 migrate 接口块 + 令牌文件，本地全量自检后打包），`node scripts/pocketbay-deploy.mjs <tarball>` 部署，`GET https://gotrip.pocketbay.app/api/admin/migrate/dump?token=<令牌>` 拉全量 JSON，随后**立刻重部干净 master** 关闭通道（2026-09-17 实测 #8930 导出 → #8931 恢复，窗口约 90 秒）。
2. **云托管侧（导入，控制台 Webshell）**：服务列表 → gotrip → 服务设置/更多 → Webshell，粘贴（需 PocketBay 处于一次性导出版本）。现成的一行命令（含令牌）在 `work/migration/webshell-command.txt`（gitignore，勿提交）：

   ```bash
   cd /app && curl -s 'https://gotrip.pocketbay.app/api/admin/migrate/script?token=<令牌>' -o migrate.ts \
     && node migrate.ts 'https://gotrip.pocketbay.app/api/admin/migrate/dump?token=<令牌>'
   ```

   加 `--dry-run` 先试运行不写库；URL 源会自动作为图片拉取源。若云上部署了含此代码的版本（令牌文件在包内），也可直接 `POST /api/admin/migrate/import`（body 为 dump JSON）。

   ✅ 2026-09-20 现状（按此执行，别再照上面的在线拉取跑）：PocketBay 侧通道**已关闭**（#9316 干净 master，带正确令牌也 404，不要再为导入重开），源数据已在本地 `work/migration/pocketbay-prod-dump-0920.json`（与 09-17 存档逐表一致，0 图片 → 不需要 `--pb-origin` 内联）。**所以默认走 B**：容器里 `ls -l /app/server/src/migrate.ts` 确认后，按 `work/migration/webshell-command.txt` 的清单离线粘 4 片 base64 → `--dry-run` → 真导入 → `curl -s localhost:8787/api/auth/login` 验。只有当你确认「09-20 之后 Web 端又写了数据、必须重拉」时，才走 A（唤醒 PB → `node scripts/pocketbay-deploy.mjs work/migration/gotrip-oneoff-v2.tar.gz` 重开窗口 → 导完立刻 `node scripts/pocketbay-deploy.mjs work/migration/gotrip-master-restore.tar.gz` 关窗，并收工前复验 script 端点 404）。C 路（上传带令牌的云托管版本后本地直接 `POST /api/admin/migrate/import`）适合公网还开着、又不想进 Webshell 时用，同样要分钟级收口。
   - **A（推荐，与手册原设计一致）**：唤醒 PB → 若 `/script` 探针回 404，用现成的一次性包重开窗口：`node scripts/pocketbay-deploy.mjs work/migration/gotrip-oneoff-v2.tar.gz`（包已打好：master + 补丁路由 + 令牌文件，105 个文件，与 `webshell-command.txt` 里的令牌同一个）→ 云 Webshell 粘贴上面那条命令 → 导完立刻重部干净 master 关窗（窗口控制在 90 秒内）。
   - **B（不依赖 PocketBay 活着）**：用已存档的 `work/migration/pocketbay-prod-dump.json`（2026-09-17T17:12Z：5 用户/4 旅程/112 行程项/0 图片）。粘贴物料已备好——照 `work/migration/offline/README.txt` 的顺序贴 `00-header → p1…p4 → 99-run`（先 `--dry-run`，去掉尾标即真导入），4 片重组与原 dump 已 `cmp` 校验字节一致。**前提**：容器里存在 `/app/server/src/migrate.ts`（feat 构建 4388b78 起自带，引擎只依赖 node 内置 + 镜像里的 mysql2）；没有就说明云上还是旧版本，回 A 路。**代价**：拿不到 09-17 之后新产生的数据，导入前先确认这段窗口 Web 端没写入。
   - **C（不进 Webshell，走 HTTP；物料与脚本已本机全量验证）**：上传 `work/migration/gotrip-cloudrun-token.zip`（= 干净构建 + 故意带上 `server/src/admin-migrate-token.txt`，182 条目、无 `.env`/密钥），发布后**临时开公网访问**，本地一条链跑完：

     ```bash
     node work/migration/post-import.mjs --base https://<云托管默认域名> --check   # 健康 + 通道
     node work/migration/post-import.mjs --base https://<云托管默认域名> --run     # 导入 + 自检
     node scripts/pocketbay-deploy.mjs work/migration/gotrip-cloudrun.zip          # ← 关通道用的不含令牌
     ```

     ⚠️ 三条硬约束：① 窗口只留几分钟，`--run` 一验完立刻重部**不带令牌**的包并把公网访问关回（红线 7：开窗与关窗算同一步，收工前再探一次 `/api/admin/migrate/script` 必须是 404）；② `POST /api/admin/migrate/import` 没有试运行档（引擎自己会先备份云库全表 + 单事务 + 引用校验失败即回滚）；③ 通道判活只能用带正确令牌的 `GET /script`——令牌文件缺失时路由同样回 404，「路由不存在」和「令牌不对」长得一模一样。
     本机验证（2026-09-20，全新 `mysql:5.7` 空库 + 生产 dump）：`--check` 两步通过 → `--run` HTTP 200 / 0.8 秒 / 13 张表最终行数 5 用户·4 旅程·112 行程项·142 动态 → 自检 6/6（demo 用 PB 旧哈希登录、两趟迁移旅程在列、呼伦贝尔 37 项、wechat 探针 400）。
3. **验证**：`node work/migration/cloud-verify.mjs`（公网探针：demo 登录、迁移旅程行数、bundle 体积、feat 代码在线）。**该脚本走公网默认域名**——若已按安全要求关掉公网访问，改为在 Webshell 里 `curl -s localhost:8787/health` 与容器内跑同一份断言，或临时开公网验完再关。真机小程序：账号密码登录 → 行程列表出现迁移旅程。

历史数据怪癖（引擎已处理）：旧数据用 `0` 表示「未指派」→ 归一为 NULL；成员删除不清理记账/指派引用 → 孤儿保留原值仅告警（与现网行为一致）；`TEXT`(64KB) 装不下 200KB 头像 dataURL → `avatar_url`/`journal_notes.images` 升 `MEDIUMTEXT`；**MySQL 首次种子 journal INSERT 缺 images 列在严格模式必崩 1364**（云库此前种子残缺：有记账打包、无日志/动态/锦囊），已修。

## 故障排查：公网域名 504（容器起不来）

先用一条命令分清是哪种故障（不需要控制台）：

```bash
curl -s -D - -o /dev/null --max-time 45 https://<默认域名>/health | grep -iE "^HTTP|x-cloudbase-upstream"
```

| 现象 | 含义 | 处理 |
|---|---|---|
| 504 + `x-cloudbase-upstream-status-code: -`，约 30 秒超时 | 网关从未拿到容器响应＝端口没监听（实例没起来/构建版本未发布/启动即崩） | 见下面四步 |
| 502/500 且有 upstream 状态码 | 容器在跑但应用报错 | 看运行日志栈 |
| 连接立刻被拒或 403 | 服务设置里公网访问已关（安全要求，正式版就该关） | 验证期临时开、验完关；或改用 Webshell 里 `curl localhost:8787` |

504 的四步（控制台）：

1. **服务列表 → gotrip → 版本配置**：确认有「已发布」版本。只有「构建成功未发布」→ 点发布（本项目的历史坑：仓库流水线显示完成但线上还是旧版本，见 HANDOFF 事故表）。
2. **最小实例数临时设 1**：`0` 时冷启动要靠请求触发，一旦启动就慢/失败会陷入「请求→超时→再没起来」的死循环，调成 1 让它常驻便于看日志。
3. **运行日志**：本仓库代码 2026-09-19 起是「先监听端口、数据库后台重试」，所以容器能起来；日志里找 `[db] 初始化失败（第 N 次）…`，第 3 次会直接提示核对 `MYSQL_ADDRESS/MYSQL_USERNAME/MYSQL_PASSWORD`。若反复 ECONNREFUSED/TIMEOUT，问题在数据库侧。
4. **数据库管理 → MySQL**：看内置实例是否被暂停/回收/欠费（Serverless 闲置会暂停，首次连接要等它恢复，通常 1~2 分钟）。

> 2026-09-20 实战结论：gotrip 这次的 504 就是第 3 步抓到的——运行日志里 `[db] 初始化失败（第 65 次）` 指向建表 1064（表达式默认值要 MySQL 8.0.13+，内置版本更低），**不是**数据库连不上也不是版本没发布。没有条目 35 那套「先监听 + 后台重试 + 把错误打进日志」的改动，这种故障在云托管上根本看不见错在哪。

恢复判据：`/health` 返回 `{"ok":true,"db":"ready","driver":"mysql"}`；`/api/auth/wechat`（无头）返回 400 说明 feat 代码在线。**Webshell 也要求有运行中的实例**，504 期间进不去，所以迁移导入必须等服务先起来。

## 回滚

云托管「版本列表」保留历史版本，出问题一键「回滚」到上一版本；数据库结构由启动迁移自动演进，回滚代码版本不会回滚数据。
