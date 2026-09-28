# 原生小程序全量验收报告 · 第二轮（2026-09-29）

**版本基线**：feat/miniprogram `910aa7e` + 本轮 review 修复；容器 gotrip-020
**工具**：miniprogram-automator 分段自愈（`work/accept-0929.js`，8 段，支持 ONLY=S1,S2… 段选重跑）
**结论：53 项断言全部通过，console 全程零错误。发版 1.5.9。**

## 一、结果总览（8 段 53 断言）

| 段 | 覆盖 | 项数 |
|---|---|---|
| S1 启动链+home+overview | welcome 自动进 home、列表渲染、卡片跳转、功能格 | 8 |
| S2 出发页+我的+消息+锦囊 | hasTrip/站点/7 天 pill/切天/勾选翻转、profile 全入口 | 11 |
| S3 九个次级页遍历+深色三档+journal 空态 | schedule/map/packing/settle/links/places/flights/helper/ai | 12 |
| S4 create 空值/超长 60 字/提交/删除/P1 回归 | 8 | 8 |
| S5 卡片编辑（新增） | 弹层打开/标题保存/列表刷新/恢复 | 4 |
| S6 日程表单（新增） | 表单打开/保存+站点+1/兜底编码命中坐标 | 3 |
| S7 同伴管理（新增） | 页面就绪/添加+1/在列/移除复原 | 4 |
| S8 背景图按钮+地图上图（新增） | 相机钮存在/hasCoords/markers 渲染 | 3 |

**测试类型**：正常值（伊春行程全链路）／空值（journal 0 日志、create 无日期拦截、表单空名拦截）／超长（60 字标题建删、卡片标题 60 字编辑）；移动端=devtools 移动视口逐页截图（`work/accept-0929/*.png`）。

## 二、本轮 Review 发现并修复的问题（按严重度）

1. **[P0] `utils/api.js` 漏传 `X-WX-SERVICE: gotrip` 服务头**——callContainer 无服务名无法路由（实测 404）。**原生版全部容器 API 自迁移以来全部不可用**：AI 攻略解析、行程生成、锦囊、使用助手、飞哪儿、POI 搜索、天气、地理编码。Taro 版有此头（src/api/request.ts），原生重写时丢失。
   - 复现：日程表单保存带地点 → 控制台 `[DBG geocodeOne] FAIL 接口错误 404`。
   - 修复：api.js 显式 `header: {'X-WX-SERVICE': WX_SERVICE}`；automator 直调 `geocodeOne` 验证 404→高德命中→落库成功。
2. **[P1] 容器 `/api/poi/geocode` 入参形状不兼容**——服务端 filter 只认 `it.title`（老 Taro 形状），原生端传 `it.query` 全被滤空。已兼容 `query|title`、`alt|place` 双形状（gotrip-020 部署生效）。
3. **[P1] 地图页 `autoGeocodeOnce` 定义了但从未被调用**（死代码）——自动批量编码从未执行。已接通 boot（缺坐标时触发）+ 空态「立即定位/去日程补充地点」按钮。
4. **[P2] geocodeOne 落库后不刷新本地快照**——坐标写入库但页面距离估算/地图数据不更新。已补 `this.refresh()`。
5. **[P2] `schedule.chooseOnMap` 条件运算优先级**：选点无名称无地址时整体 return 丢坐标。已改为 `!(r && (r.name || r.address))`。
6. **[P3] `store.js` deleteTripById 首行格式损坏**（上轮编辑吞换行）。已修复。
7. **[P3] 测试缺口**：新增 4 功能此前零自动化覆盖——本轮补 S5–S8 四段断言。

## 三、错误与复现（验收过程中出现并已解决）

| 现象 | 复现 | 根因 | 处置 |
|---|---|---|---|
| 日程表单保存后断言失败 | 表单保存 → 2.4s 后断言 | 云写穿透 3~10s+，固定等待不足 | 断言改轮询（≤15s）；自动化对云写一律轮询 |
| geocode 线上探针恒空 | curl -d 中文 JSON | **Git Bash 按 GBK 发送中文 body（红线 3）**——探针自身污染的假阴性 | 一律 UTF-8 文件 + `--data-binary @file`；UTF-8 重测命中（五营→48.228,129.275） |
| 删除断言失效 | callMethod removeTrip | removeTrip 现在先弹原生 actionSheet，automator 无法驱动 | 脚本改 callMethod('doDelete', id) 直达 |

## 四、验收副作用清理

- 「验收占位安排」活动（geocode 链路测试）×3：已全部删除（SQL）；
- 「验收同伴」成员：S7 内增删闭环，无残留；
- 「【验收】」标题标记行程：S5 内改回复原，无残留；
- 云端当前行程：2 条「小兴安岭七日 · 红松林与界江秋色」（两账号各一），子表数据与坐标完整。

## 五、已知限制

- wx.chooseLocation/picker/showActionSheet 为原生面板，automator 无法驱动——相应路径以 callMethod+mock 覆盖业务逻辑，UI 层人工确认。
- 云写穿透 3~10s 为平台特性（数据模型写延迟），表单类操作已有 loading 反馈。
- 高德坐标为 POI 级精度；产品标注意「位置仅供参考」。
