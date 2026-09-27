# 小程序设计规范 ·「晴空航线 Clear-Sky Flight」

> 2026-09-27 UI 改版落地。视觉源稿：`E:\code\picture\gotrip-ui\`（14 屏 HTML 设计稿 + `css/gotrip.css` 设计系统，已通过 3 轮视觉验收）。
> 本文档是设计稿 → 小程序 WXSS 的映射说明，改样式前先读它。样式代码唯一入口：`miniprogram/src/app.css`。

## 一、设计语言

- **主色 天空蓝**：工具界面的骨架色（导航、主按钮、图标格、D 徽标、选中态）。
- **点缀 那不勒斯黄**：只用于「行动/能量」时刻——主行动按钮（记一笔/生成锦囊/发布）、进行中徽标、日期 chip、进度条填充。黄底文字一律 `--yel-text #6B5200`，浅底黄字 `--yel-ink #A97E00`。
- **墨色层级**：`--ink #182A3D`（标题）/ `--ink-2 #51637A`（正文辅）/ `--ink-3 #93A5B8`（说明）/ `--line #E6EEF6`（发丝线）。
- **形状**：卡 36rpx 圆角 + 蓝调投影 `--sh-card`；按钮全圆药丸；主按钮蓝渐变 `135deg #55ACF3→#1B78D8` + `--sh-blue`，黄按钮 `#FFDE5C→#FFC414` + `--sh-yellow`。
- **母题**：旅程封面 = `coverColor` 渐变块 + 大 emoji + 底部压暗 scrim + 白字标题 + 黄色 chip。照片母题暂未引入（数据层无封面图字段，留待后续）。

## 二、Token 对照表（设计稿 px → 小程序 rpx，×2）

| Token | 值 | 用途 |
|---|---|---|
| `--sky-50/100/200/300/400/500/600/700` | `#F1F8FE … #1663B4` | 天空蓝 ramp；500 主色、600 链接/按压 |
| `--yel-100/200/400/500/600` | `#FFF6D9 … #E0A800` | 那不勒斯黄 ramp；400/500 填充 |
| `--yel-text` / `--yel-ink` | `#6B5200` / `#A97E00` | 黄底文字 / 浅底黄字 |
| `--ink / --ink-2 / --ink-3 / --line` | `#182A3D / #51637A / #93A5B8 / #E6EEF6` | 墨色 + 发丝线 |
| `--green / --red` | `#2FA96E / #F0655A` | 成功/警示（结算多付绿、待付红） |
| `--bg / --card` | `#F3F8FC / #FFFFFF` | 画布 / 卡面 |
| `--sh-card / --sh-blue / --sh-yellow` | 见 app.css | 卡影 / 蓝钮投影 / 黄钮投影 |

设计稿 375 宽 = 750rpx，故稿上 px × 2 直接得 rpx。字级：大标题 46rpx/800、页标题 44rpx/800、区块 33rpx/800、正文 28rpx、辅助 25rpx、说明 22rpx；数字一律 `tabular-nums`。

## 三、组件 → 类名速查

| 组件 | 类名 | 备注 |
|---|---|---|
| 主按钮（蓝渐变大） | `.submit` | 创建旅程/添加安排/解析预览 |
| 行动按钮（黄渐变大） | `.submit.yellow` | 导入演示行程/生成锦囊 |
| 小按钮 | `.submit-inline`（`.yellow`） | ＋新建/发布/记账 |
| 幽灵按钮 | `.ghost` | 取消/返回类 |
| 危险按钮 | `.danger` | 删除类（红描边，非红底） |
| 记账 FAB | `.fab` | 固定右下，黄渐变 |
| 筛选 chip | `.chip`（`.on` 蓝底）/ `.fw-chip` | 锦囊兴趣/头部分类 |
| 分段控件 | `.fw-seg` + `.fw-seg-item.on` | 往返/单程 |
| 卡片 | `.card` / `.panel` | 白底 36rpx 圆角投影 |
| 总账蓝卡 | `.sum-card` 系列 | 预算页顶部 |
| 行程卡 | `.trip-card`（cover/body） | 首页列表 |
| 封面 Hero | `.hero-cover` / `.hero-body` | 行程详情页 |
| 功能格 | `.fn-grid` / `.fn-item` / `.fn-ic` | 行程页 7 宫格 |
| 天分组 | `.day-block` / `.day-num` / `.act` | D 徽标蓝渐变方块 |
| 支出单元 | `.exp-cell` / `.exp-ic` | 分类 emoji + 金额右对齐 |
| 结算格 | `.settle-grid` / `.settle-cell` | 头像 + 多付绿/待付红 |
| 勾选圈 | `.check`（`.on`） | 打包清单，蓝圆点 |
| 头像 | `.avatar` | 默认蓝渐变，数据 avatarColor 可覆盖 |

## 四、硬约束（沿用 docs/miniprogram-features.md 第五节）

1. 只动皮不碰 `src/rdb/` 数据层；云写入有延迟，一切「写后刷新」走 load() 重拉。
2. 图标体系 = 数据驱动 emoji（非 SVG mask），与封面/分类字段天然一致；设计稿的线性图标仅用于状态栏/胶囊等系统件（小程序由原生渲染，无需实现）。
3. 静态资产（logo/marker）走 `src/assets/` + 构建拷贝到 `dist/assets/`（`config/index.ts` 的 copy.patterns；注意 Taro 3.6 的 `to` 相对项目根，需带 `dist/` 前缀）。
4. 地图 marker 用 `iconPath: '/assets/marker.png'` 绝对路径（曾因图片缺失静默 404，2026-09-27 修复）。\n
## 五、二轮改版（2026-09-27 · tabBar 三栏）

- **原生 tabBar**：行程 / 消息 / 我的（`app.config.ts`）。图标 = 设计稿圆头线性 SVG（ic-home/chat/user）经 Chrome headless 渲染的 PNG（81×81，灰 `#93A5B8` / 选中蓝 `#2E92ED`，`src/assets/tab-*.png`）。tab 页导航标题由原生渲染、天然居中。
- **消息页**（09-messages）：跨行程动态流——`listTrips` + 逐行程 `gt_activity_log`（各取 30 条）合并，按行程分组（trip-chip 头 + 动态 cell），组间按最新动态时间倒序；空态为黄色引导卡。行程 chip 与动态 cell 均可点入行程页。
- **我的页**（14-profile，按用户要求裁剪）：资料卡（首字头像 + 昵称 + 「旅行家 Lv.n」黄徽标 + GoTrip ID 尾 6 位，铅笔按钮走 editable showModal 改昵称 → `updateRow('gt_users')`）+ 4 格统计（行程数/足迹城市去重/打卡地点=活动数/一起记的账=总支出，数据全部来自 `listTrips` 的 TripCardInfo，零额外查询）+ 菜单：我的行程（switchTab）、**飞哪儿**（从首页迁入）、编辑资料、关于。**无「自托管服务」板块、底部脚注为「出发吧 GoTrip · v1.3.0」（无自托管字样）**。
- **新增功能位**：行程卡长按删除（`ops.deleteTrip` 级联清理 11 张行程子表 + 主行），确认弹窗红色 confirmColor——此前行程无删除入口（功能缺口）。
- **演示种子**＝用户指定手绘路线图：国庆伊春深度游（2026-10-01~07，7 天 23 项安排 + 4 占位同伴 + 5 笔支出共 ¥2,844 + 清单 + 4 条动态）。
- 页内图标补充：cell-route/cell-plane(实为 ic-send 纸飞机)/cell-gear PNG（72×72 蓝），用于我的页菜单；与数据驱动 emoji 并存（菜单固定项用线性图标，数据项用 emoji）。
