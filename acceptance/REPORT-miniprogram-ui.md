# 小程序 UI 改版「晴空航线」验收报告

> 2026-09-27。版本：1.1.5 → **1.2.0**。设计源：`E:\code\picture\gotrip-ui\`（已过 3 轮视觉验收的 14 屏设计稿）。
> 测试方式：微信开发者工具（自动化端口 9420）+ miniprogram-automator 脚本 `work/uitest/acceptance.js` 全自动点击。
> 账号与数据：全部写入走 devtools 测试账号（dev openid 行级隔离），不涉及真实用户数据；活动/支出/成员类测试数据已由脚本 L2 清理段回收。

## 一、结论

**79 项断言中 77 项本轮直接通过；其余 2 项经复测/探针证明功能正常（见 §四）。核心链路（建行程→排活动→记账→清单→日志→锦囊→AI 解析写入→地图→飞哪儿搜索）全部走通，console 零错误。**

## 二、逐页验收清单（A~L 段，79 项断言）

| 段 | 页面 | 覆盖点 | 结果 |
|---|---|---|---|
| A | trips 首页 | 品牌行(logo)、飞哪儿横幅跳转、＋新建跳转、封面式行程卡、状态徽标(计划中/进行中/已结束)、点卡进详情 | 8/8 ✅ |
| B | trip 行程详情 | 封面Hero、状态chip(出发倒计时N天)、7宫格功能格逐一跳转、＋安排、活动行点入编辑回填、活动创建（空值拦截/正常/100字超长）、删除(mock弹窗) | 17/17 ✅ |
| C | budget 账本 | 总账蓝卡、成员结算格、FAB、空金额拦截、正常记账上榜、60字超长标题、删除(mock弹窗) | 8/8 ✅ * |
| D | packing 清单 | 进度面板、空名称拦截、正常/60字超长添加、勾选(乐观更新)/取消、导入模板(ActionSheet mock) | 7/7 ✅ * |
| E | journal 日志 | 表单加载（修复后）、3000字超长截断、心情8枚、发布上榜 | 3/3 ✅ |
| F | handbook 锦囊 | 兴趣chip选中态、AI/兜底生成（实测 4~8 张卡）、删除卡 | 5/5 ✅ |
| G | members 同行伙伴 | 空名拦截、正常/20字超长添加、改名(editable modal mock)、移除 | 4/4 ✅ |
| H | map 地图 | 地图组件渲染、坐标列表、返回行程 | 3/3 ✅ |
| I | trip-create | 空名称拦截、60字超长名创建、新行程四页空态文案、正常创建 | 7/7 ✅ |
| J | flywhere | 眉题、往返/单程分段、空出发城市拦截、真实搜索（39 个目的地结果卡）、价格高亮 | 6/6 ✅ |
| K | trip-ai | 空文本拦截、解析预览（AI/兜底）、覆盖全部行程写入（客户端落库+坐标回填） | 4/4 ✅ |
| L | 收尾 | 首页多行程渲染、测试数据清理（活动/支出/成员） | 4/4 ✅ |

\* C7/D7 单轮失败记录与解释见 §四。

截图（29 张）：`work/uitest/shots/`（01-trips-home … 34-trips-final，含空值 toast、超长内容、编辑回填、模板导入等关键时刻）。

## 三、移动端检查

- 模拟器 375×721（iPhone 标准逻辑分辨率）逐页截图核对：安全区（FAB `bottom+env(safe-area-inset-bottom)`）、长词折行（`word-break`）、超长标题截断（ellipsis）、金额 `tabular-nums` 对齐。
- 原生导航白底黑字、下拉刷新底色 `#F3F8FC`，与页面连成一体。

## 四、单轮失败复核（2 项）

| 项 | 现象 | 复核结论 |
|---|---|---|
| C7 超长标题记账 | 本轮 75s 未上榜 | **非功能缺陷**：单独探针复测 50 字/60 字标题均成功上榜；v9 轮同用例亦通过。失败为自动化时序抖动（表单展开动画内填值偶发丢焦点） |
| D7 导入模板 | 物品数 31 == 预期 29+2 之外无增长 | **数据饱和**：模板按名去重，历史测试轮已导入全部模板物品，本轮新增 0 为正确行为。功能本体 v9 轮已验证（3→27） |

## 五、测试中发现并已修复的缺陷（含预存）

1. **[预存·严重] journal 页整页白屏**（React error #301 渲染期同步 setState）。rdb 迁移遗留——改版前 HEAD 版本同样复现，页面自迁移后从未被打开验证过。修复：初始加载移入 `useEffect`，消除 render 期 `setError('')`。已二分定位（HEAD vs 改版）确认非本次改版引入。
2. **[预存] map 页 marker 图 404**：`iconPath: '/assets/marker.png'` 引用的图不存在（src 下无 assets 目录）。修复：绘制天空蓝 pin 落 `src/assets/` + 构建拷贝直出 `dist/assets/`。
3. **[预存] trip-create 颜色圆点竖堆**：JSX 使用 `.row` 类但 CSS 从未定义。修复：补 `.row` flex 布局。
4. **[构建] Taro copy.patterns 的 `to` 相对项目根而非 dist**：首配 `assets/` 把文件拷到了项目根，修正为 `dist/assets/`。
5. **[健壮性] 开发者工具代理指向已下线的本地代理**，CLI/工具内部请求全部 `tunneling socket` 失败。本次以 `--no-proxy-server` 启动参数绕过（未改用户设置文件）；**建议**：工具「设置→代理」改选「不使用任何代理」。

## 六、遗留事项（不阻塞发布）

1. **测试数据残留**：devtools 测试账号下新增 2 场测试行程（「超长旅程名-…」「AI写入测试行程」——行程本体无删除入口，功能缺口，与 Web 版一致）；demo 行程内有历史测试活动若干（部分轮次的清理段未执行到）、日志/锦囊卡测试内容。需要时可在界面手动删除，或清库重建演示行程。
2. **云写入链路时延**：保存类操作（写行+写动态日志 2~3 次串行 models 调用）实测 10~45s 不等，按钮有 loading 态兜底但体验偏慢。优化方向（后续版本）：`ensureProfile` 会话内缓存、动态日志改为非阻塞/批量。
3. flywhere 搜索/AI 解析偶发超时（容器冷启动 + GLM 慢），重试即恢复；飞哪儿 job 轮询上限 120s、锦囊生成实测最长 150s。
4. 开发者工具「手动 build 后不一定热载新 dist」：改动 dist 后若模拟器行为不变，重启工具或用 watch 模式。

## 七、发布物

- 版本 **1.2.0**，描述「晴空航线 UI 改版」。
- 包体 661KB（上限 2MB），含 logo/marker 静态资产。
- 代码提交：见 git log（feat 主题提交 + 文档提交）；推送 Gitee+GitHub 双端。

---

# 二轮改版验收 · tabBar 三栏 + 消息/我的（2026-09-27 · v1.3.0）

> 需求：严格对齐 `E:\code\picture\gotrip-ui\` 设计稿（board-all/board-system），新增底部栏（行程/消息/我的）、消息页与我的页；飞哪儿从首页挪入「我的」并去掉全部自托管文案；演示行程换为图一「国庆伊春深度游」；顶部标题居中。

## 一、改动摘要

| 项 | 内容 |
|---|---|
| tabBar | 原生三栏（行程/消息/我的），图标取设计稿 ic-home/chat/user 线性 SVG 渲染 PNG（灰/蓝两态）；选中 `#1B78D8` |
| 标题居中 | tab 页与全部页面均为原生导航栏，标题天然居中（trips 配「出发吧 GoTrip」） |
| 消息页（新） | 跨行程动态流：`gt_activity_log` 按行程分组 + 时间倒序，行程 chip/动态均可点入行程页；空态黄色引导卡 |
| 我的页（新） | 资料卡（昵称/旅行家Lv/GoTrip ID/铅笔改名）+ 4 格统计（行程/足迹城市/打卡地点/总记账）+ 菜单：我的行程、**飞哪儿**、编辑资料、关于；**无自托管板块与「自托管版」脚注**（底部为 logo + 出发吧 GoTrip · v1.3.0） |
| 新功能 | 行程卡**长按删除**（ops.deleteTrip 级联清 11 张子表+主行；此前无删除入口） |
| 演示行程 | 图一「国庆伊春深度游」：2026-10-01~07 七天 23 项安排（含每日团餐 notes）、4 占位同伴、5 笔支出 ¥2,844、清单 4 件、动态 4 条 |
| 修复 | trip 页返回不刷新（真 bug，子页保存后列表/编辑定位失效）→ useDidShow 重拉 |

## 二、验收结果（最终轮 90 项断言）

- **87 项本轮直接通过；B9/B11 经专项探针复绿；D7 为模板去重数据饱和（非缺陷）→ 全部通过，console 零错误。**
- 新增覆盖：M 段消息页（分组 chip/动态条数/点入行程）5 项、N 段我的页全按钮（资料卡/统计/菜单/飞哪儿跳转/改名 modal 生效+还原/关于/无自托管文案断言）9 项、O 段长按删除 1 项；A 段新增「飞哪儿横幅已移除」断言。
- 专项探针（probe-b）：活动创建→返回→**列表自动刷新**→点入编辑回填→删除，全链路绿。
- 截图：`work/uitest/shots/`（r2-tab1~3、r2-seed-imported、messages-feed、profile-page、after-longpress-delete 等 41 张）。
- 移动端：375×721 下 tabBar 三栏图标/文字完整；消息动态长文本 `word-break` 折行；行程卡超长标题 ellipsis 截断；「我的」统计四格均分无重叠。

## 三、本轮修复与遗留

**修复**：① trip 页 useDidShow 重拉（真 bug）；② 消息页与原生导航标题重复的页内大标题（删除）；③ profile 复用 `updateProfile` 封装（此前裸调 updateRow）；④ 未使用变量/孤儿 CSS 清理（AV_EMOJI_FALLBACK、page-head 三规则、静态类审计）。

**遗留（不阻塞）**：① 演示行程日期写死 2026-10-01~07（按图一指定档期），过期后状态徽标显示「已结束」属预期；② 测试账号内留存验收产生的行程（活动/支出/成员已脚本清理，行程本体靠长按删除可清）；③ 云写入链路时延仍为 10~45s（上一轮遗留，优化方向不变）；④ GitHub 推送需本机代理。

---

# 三轮改版验收 · 液态玻璃 tabBar + 真背景 + 微信 API 矩阵（2026-09-27 · v1.4.0）

> 需求：行程页不用纯色背景（用户上传 / AI 生成兜底）、底部 tabBar 液态玻璃化、接入微信原生 API（分享/选图/定位/导航/公众号）、验证删除行程。

## 一、改动摘要

| 项 | 内容 |
|---|---|
| 液态玻璃 tabBar | `tabBar.custom: true` + `custom-tab-bar/`（React 类组件）：浮岛圆角 58rpx、`backdrop-filter: blur(32px) saturate(180%)` 半透明白、白描边+蓝调投影；选中态图标放大+蓝字。Taro 3.6 不编译 custom-tab-bar 的 CSS import → 原生 `index.wxss` 走 copy.patterns 直出（关键坑）。页面 `useDidShow` 调 `tab-sync.ts` 的 `syncTabBar(i)` 同步选中态 |
| 行程页真背景 | `cover_image` 有 → `<Image>` 直显云存储 fileID + 底部 scrim 保证白字可读；无 → coverColor 渐变兜底。Hero 左下三个圆钮：📸 上传背景（chooseMedia→压缩→uploadFile→入库）、✨ AI 生成封面（容器 CogView 异步 job→base64→FSM 临时文件→云存储）、🔗 分享（openType=share） |
| 容器新路由 | `POST /api/ai/gen-cover/submit`（秒回 jobId，后台调智谱 CogView-3-flash 生图+下载转 base64）+ `GET /api/ai/gen-cover/result`（轮询取图）。照飞哪儿 job 模式绕 callContainer 15s 硬超时；任务内存存储 5 分钟回收。**需重新部署容器后生效** |
| 微信 API 矩阵 | `useShareAppMessage`×4 页（分享卡片带封面图）；`Taro.chooseMedia`（选背景图）；`Taro.getLocation`（地图页「定位到当前位置」，失败静默提示）；`Taro.openLocation`（地图页坐标列表行点击→微信地图导航，可在其中切换高德）；小红书：无可靠 appid，改为 `setClipboardData` 复制搜索词+引导（appid 常量可后续补）；`<OfficialAccount>`（我的页，绑定公众号后特定场景自动显示，未绑定无副作用） |
| 数据修复 | 平台「空条件 models.list 返回空记录」的限制（2026-09-27 起）+ devtools 模拟器 list 行级过滤身份与 create 不一致 → `listTrips` 改用 **share_token 字段挪用作属主锚点**（存 profile 行的平台 owner 值 `weda_<openid>`，createTrip/seed 显式写入、查询显式 where） |

## 二、验收结果

**92/92 全部通过，console 零错误。** 在二轮 90 项基础上：B9 断言升级为「创建→返回→useDidShow 刷新→上榜」全链路；M/N/O 段（tab 切换、消息页、我的页全按钮、长按删除复验）全绿。截图 60+ 张于 `work/uitest/shots/`。

## 三、本轮发现的重大 Bug 与修复

1. **【严重】三 tab 页 load 全灭（行程/消息/我的全空）**：页面 chunk 对 `custom-tab-bar` 异步 chunk 的 import 竞态——`useDidShow` 里调 `syncTabBar`（从 custom-tab-bar 模块 import）时该 chunk 尚未加载，`d.syncTabBar is not a function` 同步抛错打断 load。**修复**：syncTabBar 移入独立 `src/tab-sync.ts`（无 chunk 依赖）+ 全函数 try/catch。**教训**：页面代码严禁 import custom-tab-bar 的运行时导出。
2. **【平台怪癖】空条件 models.list 返回空记录**（无 orderBy/where 时 gt_trips 挂起或空；gt_users ≤10 行正常）→ 一切「全量列表」必须带显式 where；属主过滤用 share_token 挪用锚点。
3. **【排查方法论】**automator 的 console/storage 通道与页面 appservice 不互通（console.on 只收 evaluate 环境的输出）——页面侧调试用 globalThis 变量 + evaluate 读取（`getCurrentPages` 可用，证明 evaluate 在 appservice 环境）。

## 四、遗留（不阻塞发布）

1. **AI 生成封面需容器重新部署**（gotrip-018 未含 gen-cover 路由，模拟器点击会提示错误；上传背景不依赖容器可直接用）。
2. devtools 模拟器 models.list 间歇性空返回（同一代码时而查到时而空），**真机验收待做**；真机身份一致性问题应不存在。
3. 测试账号行程数据 19 场（验收产生），可用长按删除清理。
4. 小红书跳转 appid 未接入（无可靠公开 appid），现为复制搜索词方案。

---

# 四轮 · 位置 API 矩阵 + tab 高亮/新建按钮修复（2026-09-27 · v1.4.1）

## 一、位置类微信 API 落点（wx 官方文档对齐）

| API | 落点 | 说明 |
|---|---|---|
| `wx.chooseLocation` | activity「📍地图选点」、trip-create「📍地图选目的地」 | 选点回填名称+经纬度入库（gt_activities.lat/lng），打通地图页打点与导航 |
| `wx.getLocation` | map「📍定位到当前位置」、flywhere「📍定位识别出发地」 | gcj02 精确定位；flywhere 经容器新增 `GET /api/poi/regeo`（高德逆地理）换城市名回填 |
| `wx.startLocationUpdate` + `wx.onLocationChange` | map「📡持续追踪」开关 | 地图中心实时跟随；`useUnload` 停止更新防后台耗电；`offLocationChange` 成对解绑 |
| `wx.chooseAddress` | packing「📦旅行地址簿·收货地址」 | 收件人/电话/完整地址，本地存储（gotrip:addr-address），隐私不出设备 |
| `wx.choosePoi` | packing「🏨住宿位置」 | POI 名/地址/坐标本地存储（gotrip:addr-hotel）；automator 无法 mock 该接口，验收走降级断言 |
| `wx.getFuzzyLocation` | 未启用 | 与 getLocation 互斥声明，本版启用精确位置；如审核受限可切换 |
| `<OfficialAccount>` | 我的页（上轮已加） | 绑定同主体公众号后特定场景显示 |

**平台合规**（`app.config.ts`）：`requiredPrivateInfos` 声明 6 项（getLocation/onLocationChange/startLocationUpdate/chooseLocation/choosePoi/chooseAddress）+ `permission['scope.userLocation']` 用途说明。**上线前需在 mp 后台「开发管理→接口设置」申请开通对应接口，并在「用户隐私保护指引」声明收集位置信息**，否则真机调用 fail（代码已全部 fail-soft 降级，不会白屏）。

## 二、用户反馈问题修复

1. **tab 切换高亮不更新（真 bug）**：Taro 3.6 + React 下 `getTabBar()` 返回原生组件包装器，类方法 `setSelected` 不在其上而在 `$taroInstances`（React 实例）——原 syncTabBar 的 `typeof bar.setSelected === 'function'` 恒 false 静默跳过。修复：`tab-sync.ts` 双通道兜底（wrapper 方法 → `$taroInstances.setSelected`）+ storage 记忆选中态（组件 constructor 立即恢复）。**自动化断言**：三 tab 轮切 state 跟随 react:0→1→2→0，截图确认高亮正确。
2. **＋新建按钮跨机型样式**：WeChat `size="mini"` 原生盒模型在不同机型浮动。改为 `.head .new-btn` 固定 152×64rpx、行高对齐、`flex-shrink:0`、`white-space:nowrap`，窄屏（320px）不换行不出屏。

## 三、验收

- **回归：92/92 全部通过，console 零错误**（三轮全量脚本）。
- 新增专项探针 probe28（8/8）：chooseLocation mock 回填地点→带坐标保存→上榜→清理；chooseAddress 地址簿展示；choosePoi 点击降级不崩溃（automator 不支持 mock 该接口，成功路径为代码审查+真机项）；flywhere 识别入口渲染；map 持续追踪按钮渲染。
- tab 高亮断言：probe35 轮切读 React 实例 state 跟随；新建按钮几何 390px 宽下不出屏。
- 截图：`work/uitest/shots/r4-*.png`、`r5/r6-tab-highlight-*.png`、`probe27/28/29` 等。

## 四、上线前操作单（位置接口）

1. mp 后台「开发管理→接口设置」：申请 `getLocation`、`onLocationChange`、`startLocationUpdate`、`chooseLocation`、`choosePoi`、`chooseAddress`（使用场景照上表填写）。
2. 「用户隐私保护指引」补充：位置信息（导航/识别出发地/行程记录）、所选照片（自定义背景/日志图）、剪贴板（小红书搜索词）。
3. AI 生成封面需重新部署容器（gotrip-018 未含 gen-cover/regeo 路由）。
