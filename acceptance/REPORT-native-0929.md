# 原生小程序全量验收报告（2026-09-29）

**版本基线**：feat/miniprogram `0b58458` + 本轮 review 修复（P1 删行程脏内存态 / P2 类型 optional / P3 px→rpx）
**工具**：微信开发者工具自动化（miniprogram-automator，分段自愈架构 `work/accept-0929.js`）
**结论：39/39 全部通过，console 全程零错误。**

## 一、结果总览

| 维度 | 项数 | 通过 |
|---|---|---|
| 启动链（welcome→home 自动进入、列表渲染、loading 收敛） | 3 | 3 |
| home（入口/卡片/跳转 overview） | 5 | 5 |
| overview（功能格数量/跳转） | 2 | 2 |
| trip-mode（hasTrip/站点/7 天 pill/切天/勾选翻转） | 5 | 5 |
| profile（昵称/编辑弹窗/菜单/消息/锦囊跳转） | 6 | 6 |
| guidebook 城市横轨 | 1 | 1 |
| 次级页可达（schedule/map/packing/settle/links/places/flights/helper/ai） | 9 | 9 |
| settings 深色三档切换 | 2 | 2 |
| journal 空态 | 1 | 1 |
| create 空值拦截/超长 60 字/提交回跳 | 4 | 4 |
| 删除当前行程 + P1 脏内存态回归 | 2 | 2 |
| **合计** | **39** | **39** |

**console 错误：0**（全程监听 console.error 与 App.onError）。

## 二、测试类型覆盖（按验收清单）

- **每个按钮点一遍**：tab 三页全部入口、overview 功能格、trip-mode 天 pill ×7 与站点勾选、profile 五入口、settings 三档主题、create 提交——均真实 tap 驱动。
- **正常值**：伊春行程全链路（列表→详情→出发模式→勾选→翻转复原）。
- **空值**：journal 0 日志空态；create 未选日期提交被校验拦截（停留原页）。
- **超长内容**：60 字标题建行程（maxlength 语义）→ 列表两行截断展示 → 删除。automator `input()` 为直写不触发 maxlength 截断（工具行为），真实键盘由基础库 `maxlength=60` 保证，脚本内以「注入 73 字 → data 收敛 60」验证同源逻辑。
- **移动端**：devtools 移动模拟器（iPhone 视口 + 底部安全区）逐页截图 40 张（`work/accept-0929/*.png`），停靠式 tabBar 无遮挡、底部 CTA 不压栏。

## 三、本轮发现并已修复的问题（含复现步骤）

1. **[P1] 删除当前行程后「出发」tab 渲染已删行程（脏内存态）**
   - 复现：home 长按删除当前选中行程 → 切「出发」tab → 页面仍显示已删行程的数据（store.trip 未清，ready 已就位不再拉取）。
   - 修复：`store.deleteTripById` 删除当前行程时同步置 `store.trip=null`、`_warmId=''`；回归断言「P1：删除当前行程后出发页无脏数据」通过。
2. **[P2] `TripCardInfo` 类型仍声明 `memberPreview`/`totalSpent` 为必有**——首屏提速后生产方已裁掉，标记 optional（`miniprogram/src/types.ts`）并重编译。
3. **[P3] `map.wxss` 天分段 `width:48px` 违反项目 rpx 约定** → 96rpx（等宽、随屏缩放）。
4. **[验收环境] create.wxml 编译报错截图**：为脚本中间态误改（91 行闭合标签）所致，已即时修复；当前全库 wxml 配平校验通过，devtools 重新编译后无错误。

## 四、验收期间产生的测试数据

- 自动化建删的「超长验收-…」行程：**已删除**（删除断言本身即验证项）。
- 云端当前：2 条「国庆伊春深度游」（1 条为用户手动导入）+ 对应子表数据，无其他测试残留。

## 五、已知限制（非缺陷，记录）

- automator 长会话桥不稳定：采用分段自愈（失败自动重启工具重放该段），本轮 S1–S4 均一次通过。
- picker（日期选择）无法自动化驱动：以 `page.setData` 写同源数据后走真实提交流程替代。
- 高德跳转/微信分享等外跳动作未实际触发（会跳出模拟器），仅断言入口存在。

——自动化脚本：`work/accept-0929.js`；断言明细：`work/accept-0929/result.json`；截图：`work/accept-0929/*.png`（40 张）。
