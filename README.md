# 🧭 出发吧 GoTrip

面向中国旅行者的自托管协作旅行规划平台。仿 TREK 的多人文旅规划体验，但为国内场景做了深度适配：高德地图瓦片与 POI、中文城市内置景点库、微信风格邀请机制、AA 记账与最少转账结算，以及可接入国产大模型（智谱 GLM / DeepSeek / 通义千问 / Moonshot）的 AI 行程助手。

## ✨ 功能特性

- **协作规划**：多成员实时协同编辑行程（WebSocket 即时推送 + 在线状态），邀请码 / 旅行 ID 两种加人方式，四种角色（发起人 / 管理员 / 成员 / 观察者）分级权限。
- **每日行程**：按天编排活动，时间、地点、坐标、费用、备注、负责人一应俱全，支持拖拽排序与跨天移动。
- **出发模式**：全屏当天视图（Trip Mode）——按天切换、逐站勾选进度、「下一站」自动高亮、站间距离估算、断网可看的手绘 SVG 路线概览，一键复制今日路线或用高德规划全天路线。
- **旅行锦囊**：按目的地自动生成美食、贴士、语言、拍摄四类手册卡片；内置全国 20+ 热门城市与出境目的地内容库，配置 AI 后由大模型定制生成，也支持成员自定义卡片。
- **旅行地图**：高德地图 / 高德卫星图双图层，按天分色聚合、虚线建议路线、按天筛选，内置景点搜索（配置高德 Key 后可搜任意地点），成员位置共享。每站支持高德导航跳转与小红书攻略搜索。
- **团队预算**：记账（分摊人 / 垫付人）、分类统计、人均消耗、预算进度条，自动计算「转账最少」的结算方案。
- **打包清单**：分类物品、指派负责人、数量备注，内置中国出行模板（证件 / 衣物 / 电子 / 洗护 / 药品）。
- **旅行日志**：按天关联的图文心情手记，谁写谁编辑。
- **成员动态**：全员的创建、记账、加入等操作自动生成动态流。
- **AI 助手**：粘贴小红书 / 公众号攻略文本自动解析为结构化行程；或输入目的地 + 天数 + 节奏 + 偏好直接生成。未配置大模型时自动降级为内置规则引擎，依然可用。
- **对外分享**：一键生成只读分享链接，适合发给长辈或不参与规划的同行人。
- **夜间模式**：亮 / 暗主题一键切换，跟随系统偏好，本地记忆。
- **天气速览**：按行程日期窗口展示目的地天气预报。

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Zustand + React Router（Hash 路由）+ Leaflet |
| 后端 | Node.js 原生 HTTP（零框架）+ `pg`（托管 PostgreSQL）/ 内置 `node:sqlite` + ws |
| 数据 | **PostgreSQL**（PocketBay 托管，读平台注入的 `DATABASE_URL`）；未设置时自动回退本地 SQLite 单文件，本地开发零配置 |
| AI | OpenAI 兼容接口（可配 base-url，国产模型开箱即用） |

Monorepo 结构（npm workspaces）：

```
go-trip/
├── client/          # React 前端（构建产物由后端静态托管）
├── server/          # API + WebSocket + 静态托管
├── shared/          # 前后端共享类型
├── Dockerfile
├── docker-compose.yml
└── .env.example     # 环境变量模板
```

## 🚀 快速开始（本地开发）

要求：Node.js ≥ 22.6（推荐 24+，需原生 TypeScript 类型剥离支持）。

```bash
npm install          # 安装全部 workspace 依赖
npm run dev          # 同时启动 server(8787) 与 client(5173)
```

- 开发模式前端走 Vite 代理：http://localhost:5173
- 生产模式直接访问：http://localhost:8787 （后端托管 client/dist）

内置演示账号：**demo / demo1234**（含两条示例旅程）。

```bash
npm run build        # 构建前端到 client/dist
npm start            # 生产模式启动（托管构建产物）
npm run check        # 前端 TypeScript 类型检查
bash scripts/smoke.sh  # API 冒烟测试（需服务已启动）
```

## 🐳 Docker 部署

```bash
cp .env.example .env    # 按需填写高德 / AI 配置（可留空）
docker compose up -d --build
```

访问 http://localhost:8787 ，数据持久化在 named volume `gotrip-data`（SQLite）。

## ⚙️ 环境变量

本地开发与生产启动都会自动加载仓库根目录的 `.env`（Node `--env-file-if-exists`，文件不存在时跳过）。复制 [.env.example](.env.example) 为 `.env` 按需填写；`.env` 已被 .gitignore 排除，不会提交。

| 变量 | 说明 | 默认 |
|---|---|---|
| `DATABASE_URL` | 平台托管 PostgreSQL 连接串（PocketBay 部署时自动注入）；设置后启用 PG 驱动，否则回退 SQLite | SQLite |
| `GOTRIP_PORT` | 服务端口 | `8787` |
| `GOTRIP_DB` | SQLite 文件路径 | `./data/gotrip.db` |
| `GOTRIP_ORIGIN` | CORS 来源 | `*` |
| `GOTRIP_AMAP_KEY` | 高德 Web 服务 Key，启用真实 POI 搜索 | 内置城市景点库 |
| `GOTRIP_AI_BASE_URL` | OpenAI 兼容接口地址 | 内置规则引擎 |
| `GOTRIP_AI_API_KEY` | 对应 API Key | — |
| `GOTRIP_AI_MODEL` | 模型名 | — |

AI 配置示例：

```bash
# 智谱 GLM（有免费模型）
GOTRIP_AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GOTRIP_AI_API_KEY=你的key
GOTRIP_AI_MODEL=glm-4-flash

# DeepSeek
GOTRIP_AI_BASE_URL=https://api.deepseek.com/v1
GOTRIP_AI_API_KEY=你的key
GOTRIP_AI_MODEL=deepseek-chat
```

高德 Key 申请：[lbs.amap.com](https://lbs.amap.com/) → 创建应用 → 「Web 服务」Key（POI 搜索）。地图瓦片默认使用公开高德栅格瓦片，无需 Key。

## 📡 API 概览

所有接口位于 `/api/*`，登录后通过 `Authorization: Bearer <token>` 鉴权（同时下发 HttpOnly Cookie）。主要分组：

- `POST /api/auth/register | login | logout`、`GET/PATCH /api/me`
- `GET/POST /api/trips`、`GET/PATCH/DELETE /api/trips/:id`、`POST /api/trips/:id/transfer | share`
- 成员：`GET/POST /api/trips/:id/members`、`PATCH/DELETE /api/trips/:id/members/:mid`、`POST /api/trips/:id/location`
- 邀请：`GET/POST /api/trips/:id/invites`、`GET /api/invites/:code`、`POST /api/invites/:code/join`
- 行程：`POST /api/trips/:id/days`、`PATCH/DELETE /api/days/:id`、`POST /api/days/:id/activities`、`PATCH/DELETE /api/activities/:id`、`POST /api/trips/:id/activities/reorder`
- 记账：`POST /api/trips/:id/expenses`、`PATCH/DELETE /api/expenses/:id`
- 清单：`POST /api/trips/:id/packing | packing/template`、`PATCH/DELETE /api/packing/:id`
- 日志：`POST /api/trips/:id/journal`、`PATCH/DELETE /api/journal/:id`
- AI：`GET /api/ai/status`、`POST /api/trips/:id/ai/parse-guide | generate | apply`
- 其他：`GET /api/poi/search`、`GET /api/trips/:id/weather`、`GET /api/share/:token`、`GET /api/users/search`
- WebSocket：`/ws?token=<token>`，消息协议 `subscribe / unsubscribe / heartbeat / location`，服务端推送 `hello / presence / change / location`

## 📄 License

仅供学习与个人自托管使用。
