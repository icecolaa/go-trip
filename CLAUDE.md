# CLAUDE.md — GoTrip AI 协作规则手册

出发吧 GoTrip：面向中国旅行者的自托管协作旅行规划平台（React + Vite 前端，Node 原生 HTTP + node:sqlite/pg 后端）。npm workspaces monorepo：`client/` `server/` `shared/`。

## 命令速查

```bash
npm run dev            # 同时启动 server(8787) + client(5173，Vite 代理)
npm run build          # 构建前端到 client/dist
npm start              # 生产启动（托管 client/dist，端口 8787）
npm run check          # 前端 TypeScript 类型检查
bash scripts/smoke.sh  # API 冒烟测试（88 项断言，需服务已启动）
node scripts/keepalive.mjs  # PocketBay 保活心跳
```

- 后端直接跑 TS 源码（Node ≥22.6 类型剥离，无编译步骤），改完即生效，重启进程即可。
- 演示账号：`demo / demo1234`。

## 架构要点

- **双驱动数据库**（`server/src/db.ts`）：设了 `DATABASE_URL` 用 pg Pool（max 5, TLS），否则回退 `node:sqlite`。DDL 双方言；启动自动建表 + 种子。**PG 迁移语句必须 await 顺序执行**（历史上接在 return 后成为死代码，生产缺表 500）。
- **后端零框架**（`server/src/index.ts` + `routes.ts`）：`route(method, path, needAuth, handler)`；错误抛 `ApiError(status, message)`，前端直接展示 message——不要裸 `throw new Error`（会变 500）。
- **FlyAI 机票搜索**（`server/src/flywhere.ts`）：spawn 子进程调飞猪 bundle，串行队列 + 429 退避 + 双层内存缓存（FlyAI 原始结果 10 分钟、搜索结果 30 分钟）。
- **读请求体** `readBody` 上限 25MB（日志多图 base64）。上传文件在 `server/src/uploads.ts`（dataURL 校验、basename 防穿越）。
- WebSocket `/ws?token=`：presence + 变更推送。完整 API 分组见 README「API 概览」。

## 红线（违反即事故）

1. **密钥只存两处**：本地 `.env`（已 gitignore）与 PocketBay 控制台。绝不提交仓库、绝不写进对话、**绝不打进部署包**（免配对部署接口会拒绝带 `.env` 的包，报 `config_policy_violation`）。
2. **缓存键必须包含所有影响结果的参数**。教训：飞哪里 `searchCacheKey` 漏 `passengers`，9 人缓存污染 2 人查询，最低总价错误。
3. **中文 curl 测试**：Windows Git Bash 会把中文 body 按 GBK 损坏——一律先写成 UTF-8 文件再 `curl --data-binary @file`；临时文件路径用 `$TEMP`（Git Bash `/tmp` 与 python/node 解析不一致）。
4. **数据库 schema 变更**：双方言同步改（SQLite 段 try/catch 兜底重复执行，PG 段 `IF NOT EXISTS`/独立 try），并在 fresh DB 上冒烟验证。
5. **提交前**：`npm run check` 通过 + 相关冒烟通过；commit message 用 `feat:/fix:/docs:/style:` 前缀、中文一句话讲清动机。
6. **提交后**：立即对本次提交的 diff 做一轮 review——明显 Bug、是否破坏已有功能、未使用变量/调试代码、测试缺口；发现问题先列问题清单再改文件，修复重新验证后追加 fix 提交，不留到下次。

## 部署（PocketBay）

打包排除 `.git` `node_modules` `client/dist` `server/data` `.pocketbay` `.env`，`POST /api/ai/deploy`（approved_config_paths 传 `'[]'`），轮询 status 到 `running`，`/health` 验证。生产环境变量（含 `FLYAI_API_KEY`、`GOTRIP_AI_*`、`GOTRIP_AMAP_KEY`）在平台控制台维护，改完需重新部署生效。详细流程、验证清单与坑：见 [docs/deployment-pocketbay.md](docs/deployment-pocketbay.md)。

## 深入文档

| 文档 | 内容 |
|---|---|
| [README.md](README.md) | 功能特性、快速开始、环境变量表、API 概览 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 当前进度、任务过程记录、事故复盘、新会话开场指南 |
| [docs/deployment-pocketbay.md](docs/deployment-pocketbay.md) | PocketBay 部署/运维、环境变量、验证清单、保活 |
| [acceptance/REPORT.md](acceptance/REPORT.md) | 2026-09 验收报告（85 项）与截图 |
| `.env.example` | 全部环境变量说明（唯一权威来源） |

<!-- neat-freak: initialized at 2026-09-10 -->
