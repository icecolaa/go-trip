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
- 容器 REST 鉴权待验证：环境级 API Key → access token → Bearer（docs.cloudbase.net/http-api/basic/access-token）。
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

## 五、进度清单

- [x] POC：MySQL 表无 CUSTOM 规则（决策依据）；PG 不可用
- [x] 14 个数据模型创建（MCP，2026-09-26）
- [x] SDK 调研（@cloudbase/wx-cloud-client-sdk 1.8.10，API 形态见二）
- [x] shared/budget.ts + shared/checkup.ts（纯函数平移，id 改 string）
- [x] shared/packing-templates.ts + sync-days（budget/checkup 同批）
- [x] miniprogram/src/rdb/{client,case,entities,trip,storage}.ts（2026-09-26，tsc 对新文件自洽；页面报错属预期）
- [ ] 小程序页面切换（trips/trip/trip-create/activity/budget/packing/journal/handbook/members/map/flywhere/login）
- [ ] 容器瘦身 + REST（flywhere_watch/share）+ x-wx-source 门槛
- [ ] 云存储上传封装（头像/封面/日志图）
- [ ] 冒烟改造（容器端点段 + REST 数据段）
- [ ] 部署 + 真机验收（1.1.0 体验版）

## 六、风险备忘

- models.* 对 MYSQL 模型的权限隔离/`_openid` 注入**未真机验证**——第一件事是开发者工具跑通一条 create→list 回读。
- `pageSize` 上限未知（feed 需要 60）；`$in` 操作符支持未知（trips 聚合用），不行就退化为逐 trip 查询。
- 环境级 API Key 尚未创建（容器 REST 用）——控制台「环境设置」或工单路径待定。
