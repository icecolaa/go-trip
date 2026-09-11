# 交接文档（HANDOFF）

> 面向下一个接手的开发者或 AI 会话。先读根目录 `CLAUDE.md`（规则手册），再读本文（现状、过程与经验）。
> 更新：2026-09-12。

## 当前状态一览

| 项 | 值 |
|---|---|
| 生产 | `https://gotrip.pocketbay.app`，部署 #7574（2026-09-12），`/health` 正常；已切换 DESIGN.md 暗色编辑风，线上资产验证通过 |
| 最近提交 | `0a42919` style: 按 DESIGN.md 全站重构为暗色单色编辑风（前置 `78297ff` docs: AGENTS.md 设计系统规则 + 收录 DESIGN.md） |
| 仓库 | Gitee `ice-colaa/go-trip` + GitHub `icecolaa/go-trip`（私有镜像），分支 `master`；origin 配了双 push URL，`git push origin master` 一条命令两边同步 |
| 数据库 | PocketBay 托管 PostgreSQL（生产）／SQLite（本地回退） |
| 验收 | `acceptance/REPORT.md` + `acceptance/screenshots/`；冒烟 `scripts/smoke.sh` 91 项全过（2026-09-12） |

## 2026-08~09 主要交付（按主题）

1. **使用体验**：使用说明从整页改为应用内弹窗（分类 chips）；全站滚动条样式统一；AI 弹窗状态去重；移动端适配。
2. **跳转修复**：高德跳转保持正确；小红书搜索词智能构造（≥4 字独立地名单独搜、短地名拼城市、互含不重复拼接）。
3. **上云**：迁移到 PocketBay 托管 PostgreSQL（读 `DATABASE_URL`，双方言 DDL，启动自动建表）；keepalive 脚本对抗闲置休眠。
4. **AI 接入**：OpenAI 兼容接口接智谱 GLM（`GOTRIP_AI_*` 三个变量）；AI 解析攻略 / 生成行程 / 使用助手悬浮球（拖拽、隐藏、找回）；生成过程加进度反馈。
5. **飞哪儿 FlyWhere**（与「我的旅程」并列的一级 Tab；2026-09-12 起界面由「飞哪里」更名为「飞哪儿」）：移植 `icecolaa/flywhere`，飞猪 AI 开放平台机票低价探索，`FLYAI_API_KEY` 走环境变量；串行队列 + 429 退避 + 双层缓存（FlyAI 原始结果 10 分钟、搜索结果 30 分钟）；缺 Key 时接口返回友好 400。**2026-09-12 前端改版**：时间与偏好（去/回程时间段）、条件 chips、地图/列表切换、按目的地分组（航司数/组合数/天气/标记已去过）、筛选排序、AI 建议三栏卡片、价格说明（费率接口）、本地查询记录（localStorage 快照，恢复不重新请求）。
8. **参考落地（源自 GitHub 发现报告，见 `work/github-idea-report.md`）**：①行程体检 `server/src/checkup.ts` + `GET /api/trips/:id/checkup`（时间重叠/转场紧张/深夜极早/未排时/满日程检查，参考 roadtrip-skill 校验思路），前端「每日行程」页 🩺 按钮；②飞哪儿价格记忆 `flywhere_watch` 表（双方言），按路线记最低单人价，重查返回 `trend` 涨跌提示（参考 flight-finder price history）；③结算建议（最小转账）项目原有能力，与 actual/firefly-iii 同类；④跨平台比价工作台（参考 flight-price-assistant，MIT）——**2026-09-12 已整体移除**（组件、`/api/flywhere/compare` 接口、`flywhere_compare` 表 DDL 与冒烟段一并删除，线上 404），原因是功能与飞哪儿核心流程脱节、自动读价在 Web 端无法实现导致价值有限。
9. **全站去 AI 味设计升级（2026-09-12 上午）**：键盘焦点环（`:focus-visible`）、按钮/chips 按压反馈、全局 `tabular-nums`、标题 `text-wrap: balance`、仪表盘骨架屏、`transition: all` 精确化、弹窗 `88dvh` 与 `role="dialog"`、日志灯箱 Esc、og/theme-color meta；清理按钮装饰 emoji 与成功文案感叹号。
10. **按 DESIGN.md 全站换肤（2026-09-12 下午，重大视觉变更）**：根目录新增 `AGENTS.md`（规则：所有 UI 代码必须遵循 `DESIGN.md`）与 `DESIGN.md`（Henry 暗色单色编辑风规范）。全站由「纸质手账风」重构为该规范：Obsidian 纯黑画布 + Carbon 卡片三层表面、暖灰 Bone/Ash/Smoke 文本与发丝边框、标题 300 字重无衬线负字距（禁 600+，全站字重上限 500）、按钮一律药丸（主 CTA 为 Bone 填充黑字）、卡片 10px/输入 6px/标签 2px、去全部渐变与卡片悬浮抬升（阴影只留 1px）、彩色（绿 #1fe274/橙 #ff9634）收敛为数据标点（价格、在线状态、行程封面左竖条）；**默认主题改为暗色**，亮色保留为同族反转（Chalk 画布黑药丸，`data-theme='light'`），主题检测逻辑已对调（index.html 早脚本 + ui.tsx）。地图按天分类色属数据编码保留。冒烟 91 项不受影响；浏览器已双主题截图验证。
6. **内容收藏**：旅行日志支持多图上传（前端 canvas 压缩 1600/400 双尺寸，JPEG 0.85）+ 缩略图；新增「攻略」Tab 收藏小红书/公众号链接。
7. **质量**：多轮代码 review 修复；`scripts/smoke.sh` 冒烟 91 项；验收报告归档。

## 事故记录与根因（重要经验）

| 事故 | 根因 | 教训 |
|---|---|---|
| 生产 links 接口 500（PG 42P01 缺表） | `migratePg` 里迁移语句接在 `return` 之后成为死代码 | 双方言迁移务必 `await` 顺序执行；改完对照 fresh DB 冒烟 |
| `db.ts` 出现重复函数定义 | 早期用补丁脚本对同一文件重复打补丁 | 改大文件优先「读最新 → 一次性重写该段」，不要反复追加；出问题用 `git show <commit>:<file>` 恢复后干净重放 |
| 飞哪里「最低总价不对」（2 人查询显示 ¥12,060） | `searchCacheKey` 漏了 `passengers`，9 人缓存污染 2 人查询 | **缓存键必须包含所有影响结果的参数**；价格类缓存验收要跑多组参数交叉验证 |
| 批量图片上传 413/失败 | `readBody` 上限 5MB，多图 base64 超限 | 上限提到 25MB；前端同时做 canvas 压缩双保险 |
| 「中文 curl body 测试失败」误判为应用 bug | Windows Git Bash 把中文按 GBK 发送 | 调中文接口一律 UTF-8 文件 + `--data-binary @file` |
| 本地起的 server 莫名消失 | 后续启动命令里的 taskkill 误杀 | 同一环境串行实验时注意进程清理范围 |
| 合成 click 点不动悬浮球 | 该元素监听 pointer 序列 | 合成事件按元素实际监听派发（`pointerdown`+`pointerup` 成对） |
| 部署 #7268 后 ~10 分钟内，生产飞哪里 2 人查询连续 3 次 500（9 人正常），~15 分钟后未做任何变更自愈 | 未定因：平台无运行日志接口，容器内 `console.error` 现场取不到；本地（Win/node26）冷、热缓存序列均无法复现，代码与 #7253 在该路径无差异 | 生产偶发 500 先隔几分钟重试、对照同 token 轻量接口（/api/me）区分 DB 与路由问题，再谈改代码；冒烟里的双人数断言（88 项）就是这类问题的回归防线 |

## 已知限制 / 后续可做

- **PocketBay 休眠**：平台机制，应用侧无法关闭，只能 keepalive 缓解（见 [deployment-pocketbay.md](deployment-pocketbay.md)）。
- **手绘地图精度**：出发模式手绘 SVG 路线的地点定位与站间直线距离依赖高德数据，景区级坐标有误差，属数据源限制。
- **测试**：目前只有 API 冒烟（`scripts/smoke.sh`，需服务已启动），无前端 E2E；补测试可从冒烟脚本扩断言开始。
- **`.env` 随包部署**：免配对接口拒绝敏感文件，生产密钥统一走平台控制台（实测记录见 deployment-pocketbay.md）。

## 新窗口开场指南

1. 读 `CLAUDE.md`（规则红线）→ 本文件（现状）→ 需要部署细节再读 `docs/deployment-pocketbay.md`。
2. 常用命令：`npm run dev`（本地）、`npm run check`（TS 检查）、`bash scripts/smoke.sh`（冒烟，需服务在跑）。
3. 改完代码的标准收尾：本地冒烟 → `git commit` + push origin master（origin 配了 Gitee + GitHub 双 push URL，一条命令两边同步更新）→ 提交后对本次 diff 做 review（CLAUDE.md 红线 6）→ 按 deployment-pocketbay.md 重新部署 → 线上验证。
