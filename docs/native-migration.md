# GoTrip CloudBase 原生化迁移（去协作 + rdb 直连）

> 2026-09-26 启动。决策与进度都在这份文档，任何会话接手先读我。
> 上位文档：docs/HANDOFF.md 条目 42（环境与部署现状）。

## 一、已定决策

1. **去掉账号协作**：邀请码/加入行程/成员角色管理/转让/WS 实时/位置共享/用户搜索全部删除；**保留占位成员**（无账号同伴，记账分摊/清单指派/活动指派依赖它）。
2. **数据层 = CloudBase 数据模型（MySQL）+ 小程序直连**：`@cloudbase/wx-cloud-client-sdk` 的 `models.*` API，模型默认权限「仅创建者可读写」按 `_openid` 行级隔离——单主人架构零规则配置。
3. **容器只留**：AI×5（parse-guide/generate/apply 转换、handbook-generate、assistant、flywhere-ai-advice、ai-status）、flywhere×3、poi、weather、share/:token（管理端 REST 读）、uploads 相关。AI 端点**只做文本→结构化转换，落库一律客户端**（保证 `_openid` 归属）。
4. **容器访问库**：flywhere_watch（全局表）+ share 读走 mysqldb REST API（`https://{env}.api.tcloudbasegateway.com/v1/rdb/rest/...`，PostgREST 风格，凭据=环境级 API Key，待建）。
5. **数据全新开始**：演示种子改为**客户端首次运行引导写入**（MCP/管理端写入的行 `_openid` 为空，客户端看不到）。
6. 小程序先行；Web/H5 阶段二（身份认证 + webv3 js-sdk）。

## 二、平台事实（实测/文档确认）

- 建表权限：MySQL 表 ACL 只有 READONLY/PRIVATE/ADMINWRITE/ADMINONLY 四标签，**CUSTOM 被拒**（POC 实测）——这就是去协作的原因。
- 数据模型已建好：**14 个模型**（MCP modifyDataModel 一次创建，2026-09-26）：`gt_users, gt_trips, gt_trip_members, gt_days, gt_activities, gt_expenses, gt_packing_items, gt_journal_notes, gt_activity_log, gt_guide_cards, gt_travel_links, gt_trip_places, gt_trip_cash_items, gt_flywhere_watch`。字段=旧列名 snake_case（int id / created_at / updated_at 不要了，用系统 `_id`(string)/`createdAt`(ms)/`updatedAt`(ms)/`_openid`）。`poc_trips` 是 POC 残留可删。
- 小程序 SDK：`@cloudbase/wx-cloud-client-sdk@1.8.10`（已装）。用法：`wx.cloud.init({env: CLOUD_ENV})` → `init(wx.cloud)` → `client.models['gt_trips']`。API：`list({filter:{where}, select:{$master:true}, orderBy:[{字段:'asc'|'desc'}], pageSize, pageNumber, getCount})` / `get({filter:{where:{_id:{$eq}}}})` / `create({data})` / `createMany({data:[]})` / `update({data, filter:{where}})` / `delete({filter:{where}})` / `upsert`。list 返回 `{records, total}`。
- 模型文本字段 ≤4000 字节 → **头像/封面/日志配图全部改云存储 fileID**（`wx.cloud.uploadFile`），彻底废除 base64 入库。
- MySQL 无 watch；若未来要实时：NoSQL 才有 collection.watch()。当前单主人无实时需求。
- ~~环境级 API Key~~：已不需要——flywhere_watch 改客户端按用户读写，share 读暂缓，容器零数据库访问。
- 身份：小程序 wx.cloud 原生 openid，`models` 调用平台自动注入身份；客户端**不需要也不获取** openid（list 自己的行即得 profile）。
- callContainer 请求带 `x-wx-source`（公网直连会被网关剥离，已实测）→ 容器新端点用它做身份门槛，防公网白嫖 AI/高德 key。

## 三、映射约定

- 模型字段 snake_case ↔ 客户端 camelCase：rdb 层统一 `toCamel/fromSnake` 深转换。
- 旧 int id → `_id` string；`assignee_member_id/payer_member_id/day_id/ref_id` 等 → 存 `_id` 字符串。
- `expenses.participants`、`journal_notes.images`、`guide_cards.items`：保持 JSON **字符串**存储（与旧 MySQL 一致，客户端 JSON.stringify/parse）。
- `trips` 模型权限：仅创建者可读写 ⇒ 分享读必须走容器（管理端可读全表）。
- 日志图/封面/头像：客户端先 `wx.cloud.uploadFile({cloudPath: 'uploads/...'})` 得 fileID，页面 `<Image>` 用 `wx.cloud.getTempFileURL` 换临时链（或 CloudBase 云存储组件）。旧 `/uploads/` 路径作废。

## 四、删除清单（去协作）

- 服务端删：ws.ts、auth.ts 的 sessions 逻辑、routes 里 auth×4、members×6、invites×5、users/search、transfer、location、ai/apply 里的落库段（改为纯返回）、calcBudget/checkup（移 shared 后删服务端副本）。
- 服务端保留并改造：ai×5（含 parse/generate 内嵌 geocode，返回带坐标的数据）、flywhere×3、poi/search、weather（**参数改请求体**：客户端传 places/dates，容器不再读 days 表）、share/:token（REST 读）、assistant、health。
- 小程序删：pages/members 的账号部分（保留占位成员管理）、ws.ts、location 上报；trips 页静默登录改 profile 建档。
- miniprogram/src/types.ts：重写为 rdb 视图（id: string，去 Invite/online 等协作字段）。shared/types.ts 本阶段**不动**（Web 还在用旧 API）。

## 五、进度清单（2026-09-26 刷新）

- [x] POC：MySQL 表 ACL 无 CUSTOM（去协作决策依据）；PG 不可用
- [x] 14 个数据模型创建（MCP，2026-09-26）
- [x] SDK 调研（@cloudbase/wx-cloud-client-sdk 1.8.10；js-sdk 3.10.1 的 ./model re-export 之，两端同构）
- [x] shared 纯函数（budget/checkup/sync-days/packing-templates）
- [x] 小程序 rdb 七件套（client/case/entities/trip/ops/seed/storage）+ 12 页切换 tsc 0
- [x] 容器瘦身：无状态代理（routes.ts 1549→约 230 行），双通道身份门（x-wx-source OR x-gotrip-key=WEB_PROXY_KEY）
- [x] 冒烟重写 10/0；UTC+8 日期偏移修复×4；写后读延迟修复（createMany idList，三处）
- [x] gotrip-015~017 部署；小程序 1.1.0→1.1.4 上传；devtools 实测行程创建 ✓、飞哪儿 ✓
- [x] **阶段二完成**：Web 切 js-sdk rdb + 身份认证（账密+匿名），client/src/rdb 移植，13 tabs 迁移，删 api.ts/JoinPage/SharePage；浏览器实测游客登录→建档→导入演示行程 9 项安排 ¥1736 全链路 ✓；gotrip-017 上线
- [x] **账密注册通道移除（条目 45）**：平台不支持纯用户名+密码自助注册（signup 501 实测）+ js-sdk auth 吞错修复；登录页=账密登录+游客；账号=控制台手动创建；localhost:5173 本地实测（错误提示/游客建档/会话保持/登出）✓
- [x] **行 id 全链断裂修复（条目 46）**：SDK create 回 id、list/get 只回 _id 不对称实测实锤，双端 entities 读路径 withId 归一 + get 空对象判 null；1.1.4 带 bug 待重传 1.1.5
- [ ] 用户验收：小程序重传 1.1.5 设体验版（真机：日志图片上传/AI/锦囊）；Web 控制台建号后自测账密登录；重新部署容器让 45/46 修复上线
- [ ] 待清：浏览器验证的匿名身份数据（不影响正式用户）

## 六、风险备忘

- ~~models.* 身份注入未验证~~ 已验证：devtools（小程序）+ 浏览器（Web 匿名）双双通过
- ~~pageSize 上限未知~~ 已修：listRows 显式 100（平台缺省 10 条，曾致静默截断）
- ~~环境级 API Key~~ 已不需要：价格记忆客户端化，容器零数据库访问
- 「写后立即 list」有平台可见性延迟——新行 id 必须取 createMany 返回的 idList（已全仓库执行）
- 云托管公网域名必须加入「安全域名」（身份认证），漏配报 Unknown error
- callContainer 15s 硬超时：长任务一律异步 job（飞哪儿模式：POST 秒回 jobId + GET 轮询，MaxNum 锁 1）
- Windows 用户级环境变量残留 MYSQL 死端点——本地起 server 必须显式清空 MYSQL_*
- **js-sdk v3 auth 方法失败不抛异常**（signInWithPassword 返回 {error}，signUp/signInAnonymously resolve 错误 body）——调用点必须检查返回值（auth.ts 的 throwOnAuthError），否则吞错假成功
- **平台不支持纯用户名+密码自助注册**（/auth/v1/signup 501），账号=控制台「身份认证→用户管理」手动创建；Web 登录页已移除注册入口
- **模型三接口返回形状不对称（实测）**：create 回 `{data:{id}}`，list/get 的行只有 `_id`；**get 未命中回 `{data:{}}` 空对象非 null**——读路径必须在 entities 层归一（withId + `_id` 判空），调用点一律读 `.id`
