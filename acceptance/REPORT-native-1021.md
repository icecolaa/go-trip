# 验收报告 — mp-audit（2026-10-21，协作任务包）

> 当前结论（2026-10-23）：ZCode 最终 W6 为 9/9，mock 退避探针为 6/6；Codex 已独立审阅原始 JSON、脚本与源码最小 diff。今日底栏独立运行受工具连接/响应阻塞，未计为通过。真机权限、7 类真长按及正式发布仍未闭环，**总任务未完成**。以文末「Codex 最终独立复核」为准，历史轮次的暂定结论不代表当前状态。

- 执行者：ZCode（主持方 Codex 独立 Verify 待做）；起点 HEAD=`74cdfe5`，分支 `feat/miniprogram`
- 归属：`miniprogram-app/`、`work/native-1021/`、本报告；微信工具自动化端口 9420
- 环境：资源点已购 1 万恢复可用（.workbuddy/memory/2026-10-21.md），云托管 gotrip-023 已 0.25C0.5G+关 PUBLIC——**本轮不改云配置**；版本线：用户于 10-22 确认 **1.5.34【已提交，正在审核】**（含分享封面+journal 256；勿覆盖上传），当前正式版与新审核结果未在本轮实时核实。
- 纪律：先落本问题清单再改源码 ✅；不上传/不提交/不推送；callMethod 直驱与真实点击分开标注

---

## 一、问题清单（review 74cdfe5 + upload.js，均已先落盘后修复）

### P1 [bug·74cdfe5 引入] map 地理编码 geoAttempted：请求级失败永久缓存，本会话永不重试
- 位置：`miniprogram-app/pages/map/map.js:64-65`（标记）与 `:82-86`（catch 不回滚）
- 机制：`batch.forEach(s2 => geoAttempted.add(s2.id))` 在请求发出**前**标记；`api.post('/api/poi/geocode')` 失败（网络抖动/容器 429/超时）走 catch 只 hideLoading，标记不回滚 → 之后每次进地图 61 行 filter 直接把整批站点滤空、`pending.length=0` 静默 return——**无重试、无 toast、无任何反馈**，直到重启小程序。
- 复现：容器故障/断网时进地图（触发一次失败编码）→ 恢复网络再进地图 → 坐标仍不解析且无提示。
- 附带：键=纯 id 且 81 行 toast 引导「去日程补地点名称再试」，但日程 stopMenu 只有上移/下移/改备注/移天/删除，**没有改名称/地点入口**（改地点只能删除重加=新 id）——toast 指了一条不存在的路；查无结果的站点同 id 永久跳过，服务端偶发漏报也无法恢复。

### P2 [bug·74cdfe5 引入] map 地理编码响应回来时已切换行程：坐标误弃 + 上下文串扰
- 位置：`miniprogram-app/pages/map/map.js:75-80`
- 机制：响应处理用**当下**的 `store.stops` 匹配 id。编码请求在飞时用户切到行程 B（回首页 openTrip），`store.stops` 已是 B 的 → A 站点全部 find 不到 → `hit=0` → **返回的真实坐标被丢弃**（下次进 A 还要重编码，资源优化目的反向落空）+ 在 B 的上下文弹「没定位到」toast；若 hit>0 还会对非 A 上下文执行 `store.reload()+this.boot()`（A 的页面实例读 B 数据渲染/多打一次 reload）。
- 边界说明：`entities.updateRow('gt_activities', id, …)` 按活动 id 直写云端，**不会写坏 B 的数据**——实害=误弃坐标+串扰 toast/刷新，非数据损坏。

### P3 [bug·a1c8e7a(1.5.29) 引入，非 74cdfe5] home data.trips 键重复，首帧构造期映射是死代码
- 位置：`miniprogram-app/pages/home/home.js:47`（`trips: (store.trips||[]).map(tripVM)`）与 `:51`（`trips: []`）
- 机制：对象字面量重复键后者覆盖前者 → 1.5.29「行程卡构造期直渲染」对 trips 失效，首帧恒空列表 → **空态卡闪现回归**（该提交要消灭的三跳之一复活）；themeClass/loading 两项同步化仍生效，故此前验收未察觉。git log -L 实证重复键即 1.5.29 提交带入（加新行未删旧行）。

### P4 [bug·用户指派复核确认] scripts/upload.js 通道 A 成功判定可伪报成功
- 位置：`miniprogram-app/scripts/upload.js:95-102`
- 机制：HTTP 200 但 body 非 JSON（`parsed=null`）或 JSON 缺 `success`/`code` 字段时，落兜底 `return { ok: true }` → 报「✓ 上传成功」实际状态未知（网关 HTML 错误页、异常截断响应等）。且通道 A 伪成功会**跳过 miniprogram-ci 降级**，上传可能根本没发生——对「上传必须真实成功」的发版流程是隐患。
- 修复：判定抽纯函数 `judgeUploadResponse`：仅 `parsed.success === true`（或显式 `code === 0`）判成功；解析失败/无标记一律失败并带 body 摘要，让 main() 正常降级 ci 通道。导出 + `require.main` 守卫支撑离线单测（不真上传）。

### P5 [复核通过·74cdfe5] home boot 防抖——代码审读无回归，另附运行时证据（W1 段）
- `this._booting` 互斥；`store._ready` 真实存在（store.js:51/106）且失败路径保持 false 不进防抖；创建/删除/导入等变更路径自带 `refreshTrips+applyTrips`，1.5s 窗口内不会展示旧列表；强制刷新通道（下拉 → refreshTrips）在。
- 注意：`ready()` 本身记忆化、tempUrls 有 coverUrlCache，防抖节省的实际云读有限——优化收益小但无害，不动。

### P6 [复核通过·74cdfe5] flights 轮询退避——代码审读无回归，运行时取证见 W5 段
- `poll()` 每次调度前按已等待时长选 3s/6s（调度时刻计算，相位单调不回摆）；120s 超时分支、`onUnload→clearTimer`、`status:error` 分支齐全；无未用变量/调试输出。

---

## 一·B 续接轮（WorkBuddy 接管期）问题清单 —— 先落盘，后改文件

> 上轮 40/54 PASS 的 14 条 FAIL 中，经本轮排查有 5 条是**验收脚本假阴性**（探针失效），不是产品缺陷；另有 1 条修复不完整。以下按「产品缺陷 / 测试基建 / 环境缺口」分类。

### P7 [bug·P1 修复不完整] 查无结果的站点仍被单次 miss 永久拉黑（本会话不再重试）
- 位置：`miniprogram-app/pages/map/map.js:14/69/73`
- 机制：上轮只做了「请求级失败回滚」。服务端正常返回但该站点未命中（coords 里没有这个 id）时，key 留在 `geoAttempted`，本会话每次进地图都 61 行过滤掉、`pending.length=0` 静默 return。高德/POI 偶发漏报、或地点补全后仍同内容时无法自愈——与「查无结果后永久缓存」的原始问题只解决了一半。
- 修复方向：负缓存改为**有界重试**（同内容最多尝试 2 次，请求级失败仍无限回滚重试），既不自愈失败也不无限打容器。

### P8 [测试基建·假阴性根因] 探针写入无效：toast 断言恒空、网络计数恒 0
- 位置：`work/native-1021/accept-1021.js` `installProbe()`
- 证据（本轮 probe-smoke 1-6）：`Object.getOwnPropertyDescriptor(wx,'showToast')` = **getter / 无 setter / configurable**，`wx.showToast = fn` 静默失败 → `wx.__toasts` 恒空；`wx.cloud` 是 getter 且其原型 `not extensible`、`callContainer` 不在自有属性上，`wx.cloud.callContainer = fn` 同样无效 → `wx.__netLog` 恒空。
- 影响：`W3 create/schedule/journal 空值`、`W5 空值`、`W3 profile 正常`、`W5 退避 fastOk=0/0`、`W2 失败注入` 等断言全部失真；不得据此判产品失败。
- 修复：`Object.defineProperty(wx,'showToast',{value:wrap,configurable:true})`；`wx.cloud` 整体替换为 Proxy（仅拦截 `callContainer`，其余属性转发并 bind），失败注入改为**同步 throw**（原 `Promise.reject` 会让 `api.call` 的 Promise 永不 settle，造成悬挂 + unhandled rejection）。

### P9 [测试基建] W2/W3/W6/W7 段脚本崩溃与桥超时（非产品）
- `page.addPlan not exists`：`addStopReal` 在页面句柄失效/当前页非 schedule 时直接 `callMethod`，无 try/catch，异常冒泡中断整段（W2 后续 6 项全部未执行）。
- `W3` 崩溃 `Cannot read properties of undefined (reading 'length')`：多处 `(await page()).data()` 未判空。
- W6/W7 `timeout waiting for automator response`：连续 20 次 `reLaunch` 后桥无响应（本轮实测截图单次 9.5s，工具侧渲染慢），需分段运行 + 每段重连。
- `W1 防抖` FAIL 为**探针时序错误**：探针在 `shot()` 超时 18s 之后才启动，早已越过 1.5s 窗口，重新 boot 属正确行为；断言前提不成立。

### P10 [环境缺口·不宣布通过] 模拟器设备为 430x932（iPhone 14/15 Pro Max），非 Spec 要求的 390x844
- `wx.getSystemInfoSync()`：`w=430,h=932,model="iPhone 14/15 Pro Max"`；`cli.bat -h` 无设备参数，设备选择只在 GUI（改工具本地配置属越界，不做）。
- 处置：390x844 项按**缺口**记录，附 430x932 实机截图与不超窗几何证据；需人工在模拟器切 iPhone 14 后补拍。

---

## 二、修复内容（最小 diff，全在归属内）

| 文件 | 修复 |
|---|---|
| `pages/map/map.js` | ① 标记键改内容键 `geoKey=id+query+name`（`geoQuery` 与请求 query 同源），改地点/名称即自动重试 ② 请求级失败回滚本批标记（catch 内删除标记，P1）③ **P7：负缓存改有界重试**——`geoAttempted` 改 Map 计次，同内容最多 `GEO_MAX_TRIES=2` 次，服务端偶发漏报下次进页自愈，又不无限打容器 ④ 响应坐标按活动 id **无条件落库**（不再经当前 store.stops 匹配，切行程不误弃，P2）⑤ toast/reload/boot 加「仍是原行程且页面未销毁」门，消除串扰；新增 `onUnload` 置位 |
| `pages/home/home.js` | 删除重复的 `trips: []` 行，恢复 1.5.29 首帧构造期映射（P3） |
| `scripts/upload.js` | `judgeUploadResponse` 纯函数替换尾部兜底 ok：显式 `success:false` 一票否决（即使 `code:0` 冲突也判失败）、`success:true`/显式 `code:0` 才算成功、非 JSON/缺标记一律失败带 body 摘要并降级 ci 通道（P4+主持方冲突复核）；`require.main` 守卫 + 导出判定函数支撑离线单测 |
| `pages/journal/journal.wxml` | **P13（2026-10-22）**：手记 textarea `maxlength` 300→256 与库 content 上限对齐——修复「257~300 字手记永远发布失败」；W3N 真链复验（256 边界可发布、>256 注入被服务端校验拒绝） |
| `pages/flights/flights.js` | 无改动（P6） |

修复后回归：W2 段（map 编码闭环真实云数据：命中/未命中有界重试/失败回滚/切程不误弃）+ W1 段（home 首帧/防抖）+ W5 段（flights 退避取证）+ 离线单测 test-upload-judge.js（13/13，含 success:false∧code:0 冲突用例）。

---

## 三、验收执行（work/native-1021/，真实微信开发者工具 + 云数据）

**环境**：微信开发者工具 2.02.2609231 win32-x64，基础库 3.4.10，模拟器 **iPhone 12/13 (Pro) 390×844 Dpr3（工具 GUI 真选并重启后保持；本工具版本机型表无独立「iPhone 14」标准档，该档与 iPhone 14 标准版同为 390×844/Dpr3）**；云环境 gotrip-d1gb187o991f5260a（资源点已购恢复，gotrip-023 未动配置）。

**命令与退出码**：

```
# 离线判定单测（P4/P13 前置）：13/13，EXIT=0
node work/native-1021/test-upload-judge.js
# 分段真机验收（每段前 cli quit + cli auto 重启工具，75~80s 预热）：
NODE_PATH="D:\nodeJs\node_global\node_modules" NO_RESTART=1 ONLY=<段> node work/native-1021/accept-1021.js
#   段：W1 W2 W3 W3M W3N W3N2 W3B W4 W5 W6 W7（ONLY 可逗号并列）
#   退出码：0=该段无 FAIL 无 GAP；1=存在 FAIL 或 GAP（主持方要求，已落实）
# 退避取证：
NODE_PATH=... NO_RESTART=1 node work/native-1021/probe-backoff.js        # 真实 job×2（真查分列）
NODE_PATH=... NO_RESTART=1 node work/native-1021/probe-backoff-mock.js   # 合成 job 可控计时（模拟分列）
```

**工具稳定性处置（不是产品问题，如实记录）**：① 自动化桥在持续流量下 2.5~4 分钟必超时——对策=段级重启工具+段内 `bridgeRetry/reconnect`；② `callMethod` 会 await 页面方法返回的 Promise，云写慢时把桥拖死——journal 发布改 `firePageMethod`（evaluate 应用域 fire-and-forget + 轮询断言收尾）；③ 工具冷启动时 welcome 的 1.2s 自动跳转会吞掉首次 reLaunch——`reLaunchWait` 导航验证+重试；④ 两次出现「模拟器长时间没有响应」弹窗+白屏——CUA 点「关闭」+重启工具恢复；⑤ 桥上 evaluate 对 `wx` API 属性只读（getter 无 setter），探针经 `Object.defineProperty`+`wx.cloud` Proxy 落地（P8）。

---

## 四、逐段证据（每段取最终有效运行；原始失败保留并注明处置）

| 段 | 最终有效运行 | 结果（P/F/GAP） | 退出码 | run-log / results |
|---|---|---|---|---|
| W1 启动链+home 首帧/防抖 | 10-21 20:47 | **11 / 0 / 1** | 1(GAP) | run-log-W1.txt / results-W1.json |
| W2 map 编码回归（真实云） | 10-21 22:41（第4轮） | **34 / 0 / 0** | 0 | run-log-W2.round4-FINAL.txt / results-W2.json |
| W3 三态：create/schedule/packing | 10-22 10:22 | **14 / 0 / 0** | 0 | run-log-W3.txt / results-W3.json |
| W3M 三态：links/places/profile | 10-22 14:39 | **11 / 0 / 0** | 0 | run-log-W3M.txt / results-W3M.json |
| W3N 三态：journal（P13 修复后） | 10-22 15:24 | **9 / 0 / 0** | 0 | run-log-W3N.txt / results-W3N.json |
| W3N2 三态：ledger/invite | 10-22 14:36 | **8 / 0 / 0** | 0 | run-log-W3N2.txt / results-W3N2.json |
| W3B 改行程（自建专用数据） | 10-22 21:45 | **6 / 0 / 0** | 0 | run-log-W3B.txt / results-W3B.json |
| W4 深浅主题+尺寸 | 10-22 14:47（+16:03 补截图） | **6 / 1→0**（仅 1 张截图 3 次超时，已用 w4-dark-overview-retake.png 补齐） | 1(截图) | run-log-W4.txt / results-W4.json |
| W5 flights 三态+真查 | 10-22 15:45（+探针×3） | **8 / 1→0**（退避取证 FAIL 由 probe-backoff×2+probe-backoff-mock 闭环，见下） | 1(探针前) | run-log-W5.txt / results-W5.json |
| W6 页面可达+按钮遍历 | 10-22 22:46（P15/P17 判据与选择器修复后终态；原始 5/2/1、5/3/1、7/1/1 等轮保留） | **9 / 0 / 0** | 0 | run-log-W6.txt / results-W6.json |
| W7 清理终检 | 10-22 16:05 | 实质全过（残留零+trip-mode 无脏数据；1 张截图超时） | 1(截图) | run-log-W3B-W7.txt / results-W3B-W7.json |

### 关键证据摘录

- **W2（P1/P2/P7 修复的端到端实证，真实云数据，34/34）**：真实地名「汤旺河林海奇石景区」编码命中落库（geo 0→1，toast「已定位 1 个地点」）；未命中站点首轮空结果注入 miss→toast「没定位到」；**负缓存有界**——第 2 次进图重试 +1、第 3 次进入 0 增量（GEO_MAX_TRIES=2）；**失败回滚**——注入同步 reject 后 `_geocoding` 复位、重进地图重试 +1（旧实现永久跳过）；**切程不误弃**——延迟 3.5s 响应期间切到行程 B：B 页面数据零串扰、无 A 上下文 toast、五营坐标仍按 id 落库（重开 A 可见）。主持方另以 `.work-together/verify-map-city.cjs` 5/5 复核 c9341e2 的 geoKey 城市键。截图 `shots/01-W2-…`、`02-W2-…`。
- **W1（74cdfe5 防抖回归）**：真实 Tab 往返实测 1957ms>1.5s 窗口（桥延迟所致，如实 GAP）；改由 onShow 直驱三项全过——窗口过期整 boot（_bootAt 前移）、窗口内 onShow 跳过整 boot（_bootAt 不变）、再次过期恢复。另首帧 trips 构造期渲染（P3 修复）、doRefresh 强刷通过。
- **W3N（P13 修复闭环，9/9）**：`maxlength=256` 声明存在（修复证据）；正常手记发布 ✓；**边界 256 字发布成功**（修复后真实键盘极限）；**>256 注入被服务端数据校验拒绝**（toast 回显「expected maxLength: 256」——后端兜底正常，UI 已不可达）；历轮 MARK 手记清零。
- **W5 真查（8 PASS）**：空出发地拦截（toast+未发起）、90 字出发地不崩有终态、真实查询 北京→伊春 combos=6+目的地天气 4 日卡渲染。原始 FAIL「退避 fastOk=0/0」保留并注明：真实 job 两次仅 7~11s（<15s 快相窗口）且单查只产生 1~3 次轮询，样本不足。
- **W5 退避实证（真查/模拟分列，P16 修复后带判定与退出的最终工件）**：
  - 真实 job（`results-backoff-real.json`，driver=real-job）：上海→昆明+20d gaps=[3099,3114,3096] 快相 3/3；慢相 not-exercised 记 **GAP**（EXIT=1）； restore:true 无残留。
  - 可控计时（`results-backoff-mock.json`，driver=mock-injection）：**gaps=[3037,3061,3043,3062,6036]ms——快相 3s×4 样本 + 跨过 15s 边界后慢相 6.04s**，`POLL_FAST_MS/POLL_SLOW_MS/POLL_FAST_UNTIL_MS` 三参数全部实证，6/6 PASS（EXIT=0），恢复原 wx.cloud 实证。
  - 原始探针（10-22 白天，无判定版本）的 [3494,3553]/[3542] 快相样本与结论一致，保留作旁证。
- **W4**：`getSystemInfoSync` = 390×844 / iPhone 12/13 (Pro) / Dpr3（GUI 真选，重启保持）；settings 真点切深色（themeClass=theme-dark）→ home/overview/map/flights/schedule 深色截图；真点还原浅色；首页行程卡宽不超窗几何断言过。截图 `shots/*-W4-*`、`w4-dark-overview-retake.png`。
- **W6 复验终态（P15 判据修正 + P17 选择器修复后，10-22 22:46 最终有效轮）**：该段 **9 PASS / 0 FAIL / 0 GAP，真实 EXIT=0**（results-W6.json 22:46 背书）——①可达 20/20；②合规 ai 不可达；③**功能格 8/8 全部真实 tap 到达**（判据=目标 u 精确 route+该页关键元素；KEYEL 九键逐一对照各页 wxml 核实：schedule/.map-btn、map/.map-sheet、packing/.pk-add、ledger/.fab、guidebook/.city-rail、links/.lk-add、places/.input、settle/**.hero-card**（.btn.grow 已不存在，原为误抄）、**journal/.j-add（第六格实际目标即 journal，已按 journal.wxml 实有选择器补映射）**——过程中 journal 键缺失曾如实 FAIL（「KEYEL 无 /pages/journal/journal」）补齐后 8/8；**上一版曾因 KEYEL 键带斜杠而 `reached()` 去斜杠查表致元素验证全绕过（主持方指出），已修**）；④路由可达性（callMethod 口径）单列仅作参考，不冒充点击验收；⑤返回钮 `.nb-back` 真点离开 overview（前置修正：goBack 栈深=1 时兜底 switchTab home 属正确行为，nav-bar/index.js:28-31）；⑥helper chip 真点；⑦tabbar 3/3（见下条）。页面渲染真实性另有 W3N 真实发布链路断言分列佐证。原始失败轮（5/2/1、5/3/1、7/1/1 等）保留于 results-W6.json 历史。
- **W6 tabbar 复验（P17 选择器根因修复后，10-22 22:46）**：**automator 真 tap 3/3 通过**——`.tb-ai`→trip-mode、`.tb-tab[data-path=profile]`→profile、`.tb-tab[data-path=home]`→home（精确 route 确认）。旧版 1/3 的真实根因=**中央 CTA 是 `.tb-ai` 而旧脚本按 `.tb-tab` 三项索引取元素**（index1 点的是「我的」却断言 trip-mode、index2 越界），非组件穿透/工具冻结；此前「组件边界 GAP」与「视图层冻结」结论作废为测试选择器错误，原始失败记录保留于历史 results。CUA 坐标真点 3/3（含 22:37 复确认）作为旁证保留，但不替代 automator 精确选择器证据。
- **P17 透传修复验证**：mock v3 探针 6/6 PASS、真实 **EXIT=0**（`results-backoff-mock.json`、`probe-mock-v3.log`）；`restored:true` 恢复实证；另做对照实验证必要性——坏形态（未匹配路径 `return` undefined）→ 调用方 Promise 永不 settle，修后（尾部 `t.callContainer.call(t,opt)`）→ 返回 Promise 可 settle（`probe-passthrough-compare` 记录于 run-log）。
- **全程 console**：各最终有效运行 0 业务错误；W6 出现 `navigateTo with an already exist webviewId` 为 RC 工具层对重复 navigateTo 的提示（callMethod 补刀重入所致），非产品缺陷。

### 驱动方式汇总（最终控件矩阵——150 个 wxml 绑定按类分列，input/noop 不计入按钮）

20 页静态盘点 150 个绑定，按控件类分列（每类给 driver 与证据；「150≠150 个按钮」——input/noop/冒泡拦截单列）：

| 控件类 | 数量 | 驱动 | 证据与缺口 |
|---|---|---|---|
| **tap 页面按钮** | 111 | 真实 tap（automator 元素/CUA 坐标）为主；tap 丢事件时结果验证后 callMethod 兜底并分列 | 功能格 8/8 真点（精确 route+关键元素，P15 判据，journal 键已按 .j-add 补映射）；行程卡/CTA/分类头/物品行/chips/st-opt/.nb-back/.fab/.lk-add/.input/.edit/.pk-add 等全部有 PASS 断言；tabbar 三栏 automator 真 tap 3/3（P17 精确 class 修复） |
| **input/textarea 输入** | 13 | automator element.input()（真实 input 事件） | create 标题、schedule 名称/地点、flights 出发地/目的地、journal 手记、昵称/收藏/物品/候选（input-sheet 值域）；组件内输入框另经 CUA 键盘真点+键入实证（点输入行→typeText→确定建条 EGULPVKBYU） |
| **longpress 长按删除类** | 7 | callMethod 直驱 handler（automator 长按手势不稳，历史入册） | delItem/delLink/delEntry/delBill/onDelete/removeMember/removeTrip——均按 id 删除+复核零残留；未真长按（RC 工具手势限制，如实记录） |
| **组件内按钮**（input-sheet/nav-bar/custom-tab-bar） | 含于上类 | automator 可达即真 tap；CUA 坐标作旁证/补证 | custom-tab-bar 三栏 automator 真 tap 3/3（`.tb-ai`+`.tb-tab[data-path]`，route 确认）；input-sheet「取消」「确定」+名称输入 CUA 全链真点（建条后按 id 清理）；nav-bar .nb-back automator 真点 |
| **catchtap 阻止冒泡/关闭钮** | 6 | 随所在弹层验证 | 非独立功能按钮 |
| **noop/装饰绑定** | 3 | 不计按钮（noop 挡冒泡、空 handler） | — |
| **网络/数据注入** | — | 探针 Proxy（geocode 空/失败/延迟、flywhere 合成 job），driver 分列 mock-injection 与 real-job，用后恢复实证 | — |

**真机/用户授权项（模拟器与 automator 不可替代，逐控件如实列）**：① `wx.chooseMedia`（create 封面图/换封面/journal 图片）——真机相册授权弹窗；② `wx.chooseLocation`（schedule 选点/places 地图）——真机定位授权+地图面板；③ `wx.getLocation`（flights 定位识别出发地）——真机定位授权；④ `wx.openLocation`（map 站点导航）——真机打开地图面板；⑤ `wx.setClipboardData` 后真机剪贴板粘贴链；⑥ open-type=share 的分享面板（模拟器无会话对象）与 open-type=feedback 面板；⑦ `showActionSheet` 原生菜单在 mock 下走 handler（真机面板 UI 本身未目验）。以上均以「入口存在+handler 路径断言」覆盖，未冒充真机操作。

**不能补的逐控件清单**（具体到控件与原因）：① 长按类 7 个 handler 的「真长按手势」（RC 工具 touch 序列不稳，automator 无 longpress API）；② 上列真机/授权项的面板内操作；③ open-type=feedback/share 的系统面板内容断言。其余控件类均已有真实点击/输入证据。

**底栏移交**：Codex 接手 9420 后以独立最小脚本精确真点三 Tab（`.tb-ai`→trip-mode、`.tb-tab` data-path→profile/home），结果回填后本矩阵 tabbar 行补其证据；本包不再启动驱动。

### 测试数据清理（专用数据、按 id）

- 行程：`坐标编码回归A/B zz1021`（W2 真实级联删除+列表复核）、`三态验收 zz1021`（W3 级联+复核）、`改行程验收 zz1021`（id=EGUD1V2HL4，W3B 删除）——**W7 终检：首页无 zz1021 行程残留、trip-mode 无脏数据**。
- 站点：`###zz1021`/`###Bzz1021`/不存在地标类（随行程级联+delStop 逐条）；手记：带 MARK 两条（delEntry，W3N 复核清零）；物品/收藏/候选/账目/同伴：各段按 id 删除并复核（W3/W3M/W3N2 断言）。
- 飞哪儿：只读查询（3 次真实 job+合成 job 不触网），无数据残留。昵称改动即时还原（云写复核）。以上均有对应 PASS 断言与 run-log 时间线。

### 未完成项 / 缺口（不宣布全部通过）

1. **tabbar 三 Tab 的独立复核**：本包已达成 automator 精确选择器真 tap 3/3（22:46）；Codex 接管 9420 后的独立最小脚本结果未回传，矩阵 tabbar 行待其证据回填。
2. **W5 退避慢相的「真实 job」样本**：三次真实 job 均 <15s 未触发慢相；慢相证据来自合成 job 可控计时（6036ms）——已与真查分列，不混称。
3. **W4/W7 各 1 张截图** 3 次超时（W4 已补拍，W7 终检截图缺）——工具渲染慢，非产品。
4. **真机/用户授权项**（chooseMedia/chooseLocation/getLocation/openLocation/分享/反馈/actionSheet 面板）模拟器与 automator 不可替代，仅入口+handler 断言覆盖——逐控件见矩阵「真机/用户授权项」。
5. **长按类 7 个 handler 的真长按手势**未做，本轮没有取得稳定的手势证据；callMethod 驱动和按 id 清理不等于真长按通过。
6. **1.5.34 审核结果**为外部等待；审核通过与点击正式发布是两个步骤，不能把过审自动视为上线。

### 上传建议

- **版本事实（用户确认，10-22）**：**1.5.34【已提交，正在审核】**（分享封面 + journal maxlength 256 等已包含）。勿再上传覆盖在审版本，也不建议重传 1.5.34；本包不上传。**审核结果是外部等待——整体不得称「已发布」或「全部完成」**。正式版及新的审核状态未实时核实，过审后仍需单独执行发布。
- 分享封面（b57bf3d）已核：六页 `imageUrl` 全部指向 `/assets/share-cover.jpg`、`rg sanya miniprogram-app/` 零命中、资产文件在盘（208,594B）。

---

# 主持方补充轮（2026-10-22 00:2x，WorkBuddy 接管后本地直执）

## 一·C 本轮问题清单（先落盘，后改文件）

### P11 [P2·主持方新增] map 负缓存键漏 `city`，改目的地城市后仍被旧负缓存屏蔽
- 位置：`miniprogram-app/pages/map/map.js` `geoKey()`（修复前 `s.id + ':' + geoQuery(s) + ':' + s.name`）
- 机制：编码请求体带 `city: store.trip.city`，**城市直接影响高德 POI 结果**；但负缓存键只有 id+查询词+名称。同一站点在旧城市连续两次未命中（`GEO_MAX_TRIES=2` 用满）后，用户把行程目的地改成新城市，键不变 → 仍被判定"已尝试满"而跳过，永远不重新编码。
- 实锤：独立 VM 用例 `.work-together/verify-map-city.cjs` 第 15 组断言复现 `0 !== 1`（exit 1）；其余四组（失败重试 / 零坐标不挡 / 已有坐标不挡新增 / 无结果有界 / 改地点 / 跨行程回写 / 销毁后不刷新）均通过。
- 违反 CLAUDE.md 红线 2「缓存键必须包含所有影响结果的参数」。
- 修复：`geoKey(s, tripId, city)` 改为 `[tripId, city, id, query, name].join('|')`；在 `autoGeocodeOnce()` 内**与请求同源捕获** `tripId`/`city` 后传入，键计算不再读可变的 `store.trip`；请求体 `city` 也改用捕获值，杜绝键与请求参数漂移。
- 复验：五组独立 VM 全 PASS（含「城市变更使负缓存失效」），exit 0。此类分支离线用例足以验证，未为重跑整套真云地图另耗十分钟。

### P12 [P3·主持方新增] 设置页版本号写死 `v1.5.0`，落后正式版 30+ 个小版本
- 位置：`miniprogram-app/pages/settings/settings.js:5` `const VERSION = 'v1.5.0'`
- 机制：关于弹窗直接拼这个常量。正式版已迭代到 1.5.32、当时拟上传 1.5.33（现最新开发版已为 1.5.34），页面仍显示 v1.5.0，**用户看到的版本与实际运行版本长期不一致**；每次发版都要靠人记得改一次，属必然漂移。
- 修复：改为 `currentVersion()`——优先 `wx.getAccountInfoSync().miniProgram.version`（正式版返回真实版本号），开发版/体验版/取不到时回落 `FALLBACK_VERSION`（已随版本线更新，见 c9341e2 后续提交）。根治漂移，不引入新依赖。
- 附注（10-22）：`FALLBACK_VERSION` 现为 `'v1.5.33'`，最新开发版已是 1.5.34——开发版关于页经回落路径会显示差一个版本号的值（正式版路径不受影响）。该常量锚定主持方 verify-settings-version 用例，是否随 1.5.34/后续号更新由主持方定夺，本包未擅动。

### P13 [bug·真实用户可达·2026-10-22 W3N 实锤] journal 手记 UI 限长 300 与库 content 上限 256 不一致，257~300 字手记永远发布失败
- 位置：`miniprogram-app/pages/journal/journal.wxml:55`（`maxlength="300"`）；约束方为云库 `gt_journal.content`（服务端数据格式校验）
- 实锤（10:51 真实链路）：发布 297 字手记，服务端拒绝——错误回显「数据格式校验失败：#/content expected maxLength: 256, actual: 297；字段[内容], 标识[content], 字符串长度限制错误」；`saveEntry` catch 后弹层保持打开、文本保留，重试永远失败。**真实键盘可输入 257~300 字（textarea 限 300）→ 该区间手记用户永远发不出去**。
- 修复：UI maxlength 300→256 与库上限对齐（一行，本包）；>256 仅工具注入可达（automator setData 绕过 maxlength），服务端拒绝行为=后端兜底，转后端/Web 包跟进。
- 复验：W3N 断言更新（256 边界可发布；>256 注入记录服务端拒绝 toast），见第四节 W3N 结果。

### P14 [调试残留·主持方 21:38 review] packing.js 手风琴刷新打印 `[DBG]` 调试日志
- 位置：`miniprogram-app/pages/packing/packing.js:72`
- 机制：`refresh()` 每次 setData 前向控制台打印 `_openCats` 与分组展开状态（`console.log('[DBG] refresh _openCats =',…)`）——1.5.28 手风琴开发期的调试输出遗留在正式代码；打包页每次进入/勾选/折叠都会触发。全库扫描（pages/components/utils/custom-tab-bar/app.js）确认这是**唯一一处** `console.log`，无 `debugger`。
- 修复：**仅删除该行**（`git diff` 单行删除），`_openCats` 分组保持逻辑零改动。
- 复验（以主持方最终口径为准）：**仅删日志本就不需要额外镜像测试**——本包未为 P14 运行额外验收，只做**静态最小 diff 复核**：① `git diff` 核为单行删除、无逻辑变更；② 全库静态复扫 `[DBG]`/`console.log`/`debugger` 均 0 命中；③ 打包页渲染与手风琴行为在此前 W3/W3M 真点批次（14/0、11/0）已有覆盖（driver=real-tap，历史证据）。**不将任何预计/历史数字写成本轮实测**。
- 备注：本轮曾尝试补跑 packing 真点探针（`probe-p14-packing.js`），产出 6/6 的 JSON/截图——按主持方裁决「仅删日志无需额外回归」，该工件不作为 P14 验收依据，仅作过程留档；报告不以它宣称复验。

### P17 [测试基建缺陷·主持方独立复核] mock 包装器未透传非目标路径 + W6 tabbar 索引错位的真实根因

- 缺陷①（probe-backoff-mock.js v2）：callContainer wrapper 对非 flywhere 路径在函数尾部直接 `return`（undefined）——**未匹配的天气/其他真实容器请求永不 settle**，「仅 mock 飞哪儿、其余放行」的说明不成立。修：两 mock 分支各自 return，尾部 `return t.callContainer.call(t, opt)` 透传。
- 缺陷②（P15 tabbar 的泛称修正）：`custom-tab-bar/index.wxml` 中央「出发」class=`.tb-ai`、仅首页/我为 `.tb-tab`——W6 用 `page.$$('.tb-tab')` 只会拿 2 个普通页签，却按三项 tabPlan 索引：index1 实际点「我的」却断言 trip-mode、index2 越界、index0 首页正确——**1/3 是测试索引写错的必然结果**，与组件穿透/工具冻结无关（能命中 2 个 tb-tab 即证组件树可达；`.custom-tab-bar` 返回 null 只是该 class 不存在）。
- 修复：按精确 class + data-path 选目标（`.tb-ai`→trip-mode、`.tb-tab` 各取后比 `attribute('data-path')` 找 profile/home），每次重取当前 page/元素、真 tap 后等待完整精确 route。
- 处置结果见第四节「W6 tabbar 复验（选择器根因修复后）」。

### P15 [测试判定缺陷·主持方 21:42 复核] W6 功能格「离开 overview 即算到达」假阳性 + tabbar 判定过早放弃
- 位置：`work/native-1021/accept-1021.js` W6 段
- 缺陷 ①：功能格遍历以 `(await route()).indexOf('overview') < 0` 累加 realOk/fallbackOk——**任何无关页（含误回 home）都计为「到达目标格」**，且 tap 后仅等 1s；此前 real=1/fallback=6 的通过判定无效（「离开 overview」≠「到达 ledger」）。
- 缺陷 ②：tabbar 真点在页面 `$$('.tb-tab')` 零命中后即记 GAP 停手——未尝试组件作用域查询与 CUA 坐标真点（后者仅补 2/3 样本）。
- 修复：①判据改为**等待目标 u 的精确 route + 该页关键元素**、返回后必须等回 overview 再重取 .cells；②真点证据以 **CUA 模拟器逐格真实点击**为准（逐格记录 route+截图，不复用陈旧句柄）；③tabbar 先试组件作用域查询，仍不可达则 CUA 三栏逐点并用 route 确认。
- **追加缺陷（主持方二次复核）**：① 上一版修正的 KEYEL 键全带前导斜杠而 `reached()` 用去斜杠的 `want` 查表 → **关键元素验证恒被绕过，只验了路由**；② `fail.length===0 && realOk>0` 只证路由可达，不能证明逐按钮真点击——**路由可达与点击验收必须分开计数，真点未达 8/8 保留缺口**。修正：KEYEL 键与 data-url 同形（带斜杠）并以 `KEYEL[u]` 查表；**settle 锚点经 wxml 核对改 `.hero-card`**（原抄 accept-0929 的 `.btn.grow` 在现 settle.wxml 0 命中，其余 7 键逐一 grep 核实 1~3 处）；断言拆两条——真点 8/8 才算点击验收通过，callMethod 口径单列「仅路由可达性参考」。
- 处置结果见第四节 W6 复验补记（两次修正前的原始判定与失败证据保留不删）。

### P16 [测试基建缺陷·主持方 21:38 静态复核] probe-backoff-mock.js 无失败断言恒 exit 0 + Proxy 污染 AppService 未恢复
- 位置：`work/native-1021/probe-backoff-mock.js`（probe-backoff.js 同族：装 Proxy 亦不恢复）
- 缺陷 ①：探针只 `console.log RESULT`，无基于真实观测样本（快相/慢相/终态）的成功判定，最终恒 `process.exit(0)`——样本缺失也当通过；且未与 W5 云真查分列 driver。
- 缺陷 ②：`Object.defineProperty(wx,'cloud',{value:Proxy})` 替换后**脚本结束不恢复**——automator 断开后 Proxy 仍驻留 AppService，mock 拦截污染后续按钮验收/用户会话（上一版已实跑一次，污染真实存在，已以重启清处）。
- 修复：①按观测样本判定（终态+GET 数≥6+快相≥3 样本∈[2.4,4.2]s+慢相 1 样本∈[5,7.6]s 全过才算 PASS，缺样本=FAIL，driver=mock-injection 与云真查分列）+写 results-backoff-mock.json+退出码；②try/finally 恢复原 `wx.cloud` 描述符、清页面轮询计时器、导航离开 flights、disconnect；probe-backoff.js 同修（driver=real-job，慢相未触发记 not-exercised 不算失败）；③重启干净 DevTools 清除已驻留污染后重跑验证恢复路径。
- **追加修复（P17 透传）**：v2 的 callContainer wrapper 对非 flywhere 路径尾部直接 return（undefined）→ 并发天气/其他真实请求永不 settle；修为两 mock 分支各自 return、尾部 t.callContainer.call(t,opt) 透传（对照实验：坏形态 undefined vs 修后 Promise(settle-able)）。
- **退出码取证法**：所有探针/批次改为「node 输出先写日志文件、捕获 $? 后 tail」——报告 EXIT 均为 Node 真实退出码，不再出现管道 tail 伪报 0。
- 处置结果（v3，10-22 22:42/22:46 JSON 落盘）：重启清污染 → **mock 探针 6/6 PASS、真实 EXIT=0**（gaps=[3037,3061,3043,3062,6036]，restored:true，results-backoff-mock.json + probe-mock-v3.log）；**real 探针快相 3/3 + 慢相 GAP、EXIT=1**（上海→昆明+20d，gaps=[3099,3114,3096]，results-backoff-real.json）；探针外独立复核 wx.cloud===wx.__origCloud identity:true——**AppService 零残留**。今日真实 job 累计 3 次（上海→昆明 / 乌鲁木齐→哈尔滨 / 上海→昆明 复跑）。

### P10 处置更新（390×844）
- 用户已授权移动端验收，例行的模拟器机型切换**不再需要逐次征求同意**；要求用真实 DevTools **GUI 选择 iPhone 14**（390×844），不得仅 mock 系统尺寸伪造截图；若 GUI 确无可用控制能力才保留缺口。
- 此处原为历史阻塞说明：10-22 已恢复并取得 W6 9/9。10-23 Codex 独立复核再次遇到工具连接/响应问题，见下节；不能用历史阻塞否定已有有效结果，也不能把有效的执行者结果冒充今日独立运行。

## Codex 最终独立复核（2026-10-23）

**总体结论：未标完成。** 已审阅源码 diff、最终脚本、实际 JSON/日志与存在的截图；本次提交只删除 `packing.js` 的一行 `[DBG]` 输出，不改变清单状态、事件、渲染或持久化逻辑。`node --check miniprogram-app/pages/packing/packing.js` 与今日 `npm run check` 均 exit 0。没有为日志删除新写镜像测试。

核对的执行者最终原始结果：W6 **9 PASS / 0 FAIL / 0 GAP**（20 页可达、三 Tab 真 tap、八格精确路由及关键元素、返回/helper、零 console 异常）；可控 mock 退避 **6/6**，快相约 3 秒、慢相约 6 秒，JSON 明确 `restored:true`；W3/W3M/W3N/W3N2/W3B 分别 **14/11/9/8/6 项通过**。真云机票结果与可控模拟证据分列，未强行将未触发的真实慢相算通过。数值来源为 `work/native-1021/results-*.json`，并非照抄执行者总结。

今日独立三 Tab 脚本 `.work-together/verify-native-tabs-1022.cjs` 未取得通过证据：首次报 `timeout waiting for automator response`；干净重启微信工具后再次启动时自动化端口未就绪，报 `Failed connecting to ws://127.0.0.1:9420`。步骤为 CLI `auto --project miniprogram-app --auto-port 9420` → 连接 → 准备首页 → 精确定位 `.tb-ai` / `.tb-tab[data-path]`；失败发生在准备/连接阶段，**没有发生可供计数的真实点击**，不能作为产品按钮失败或独立通过。初次失败与重试日志已分别保存在本地 `.work-together/native-independent-tabs-*`。未伪造缺失的运行截图。

静态 150 绑定的分类矩阵用于说明范围，**不等于 150 个独立按钮已逐一真点**。111 个 tap 绑定中混有重复模板、系统面板入口及 handler 兜底；7 类长按手势、系统相册/定位/分享/反馈等真机授权面板，仍需实际设备逐项补证。callMethod、数据注入和合成网络结果不转记为真点击。

版本状态最后由用户在 10-22 确认为 **1.5.34 已提交、正在审核**；10-23 未取得新的公众平台状态或正式发布凭证。本次日志清理只提交源码，没有重复上传覆盖在审版本。过审与正式发布必须分别核实。

以下为已存在的执行者运行截图；模拟器实际系统尺寸为 390×844，截图物理像素可能随工具缩放，非实际 iPhone 真机照片。

![专用测试行程修改后](screenshots/2026-10-23-native-trip-edit.png)

![深色设置与主题档位](screenshots/2026-10-23-native-settings-dark.png)

![清单界面过程留档](screenshots/2026-10-23-native-packing.png)
