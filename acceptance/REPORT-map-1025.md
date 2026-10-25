# 地图改版验收报告（REPORT-map-1025）

- **日期**：2026-10-25
- **改动**：`miniprogram-app/pages/map/`（map.js / map.wxml / map.wxss）+ 新增 `assets/markers/pin-d1~d4.png` + 删除 `assets/marker-pin.png`、`assets/map-bg.png`、`assets/map-bg-sat.png`（零引用，省 168K，主包 2.2M→2.0M）
- **内容**：坐标图标换按天分色圆头针（SVG→PNG，work/gen-map-markers.mjs 生成）+ 天内序号 label 叠针头 + 按天连线（天色 70%+白描边）+ 视野四角外扩 8% + 点图钉二段式选中（再点/点气泡跳导航）+ 定位按钮改真定位（show-location 按需授权）+ 死样式清理（.mk 等 7 组）
- **结论**：**自动化验收全过（M1 22/22 + M2/M3 15/15），按用户清单完成**；记名 GAP 两项见文末，不阻塞。

## 环境

- Win + 微信开发者工具 RC 2.02.2609231 + 基础库 3.4.10（稳定版钉住）
- automator 分段驱动（work/accept-map-1025.mjs，ONLY=M1/M2，每次调用独立起工具避开桥劣化）
- 数据：云端真实行程（小兴安岭七日，29 站点带坐标 / 7 天）+ 一次性行程（产品路径创建、验收后删除、段首自愈清理）

## M1 正常流（22/22 PASS）

| # | 断言 | 结果 |
|---|---|---|
| 1 | home 行程列表就绪 | PASS |
| 2 | 进入带坐标地图 | PASS |
| 3 | 图标按天分色 pin-d1~4 | PASS |
| 4 | 尺寸 32×40（修 54×72 压 26×26 变形） | PASS |
| 5 | 序号 label 整数 | PASS |
| 6 | 按天连线 ≥1 | PASS |
| 7 | 视野外扩 includePoints=2 角点 | PASS |
| 8 | 筛选片 D1..D7 逐个点击（每天 markers/卡片全为该天） | PASS |
| 9 | 回到全部 | PASS |
| 10 | 卫星/标准图层切换 | PASS |
| 11 | 点图钉选中（38×48+气泡常显） | PASS |
| 12 | 底部卡片高亮 .on | PASS |
| 13 | 切选图钉 2（1 复原 2 放大） | PASS |
| 14 | 再点同一针跳导航（mock openLocation 捕获经纬度） | PASS |
| 15 | 卡片导航箭头 rowTap（捕获 name） | PASS |
| 16 | 红书按钮复制搜索链接（捕获剪贴板=xiaohongshu 链接） | PASS |
| 17 | 高德全天路线链接（捕获 uri.amap.com/navigation+via） | PASS |
| 18 | 定位按钮开→关（mock getLocation） | PASS |
| 19 | 搜索按钮跳地点页 | PASS |
| 20 | 返回地图 | PASS |
| 21 | 气泡点击跳导航 | PASS |
| 22 | 无 console error | PASS |

## M2 空值 + M3 超长（15/15 PASS）

一次性行程（标题 36 字，0 站点）走产品路径创建，验完删除：

| 断言 | 结果 |
|---|---|
| 行程创建/出现在列表/超长标题生效 | PASS |
| 空行程地图空态（hasTrip=true, hasCoords=false） | PASS |
| map 组件不渲染（wx:if 正确） | PASS |
| 底部统计归零（0 站点/0km/¥0） | PASS |
| 空行程无连线 | PASS |
| 空态按钮①「立即定位」：0 待编码早退不崩 | PASS |
| 空态按钮②「去日程」：跳转+返回（路由轮询） | PASS |
| M3 超长冒烟：40 字名称 callout+两位数序号+白描边连线 setData 注入，绑定生效不崩 | PASS |
| M3 applyFilter 恢复空态 | PASS |
| M3 全程无 console error | PASS |
| 一次性行程已清理 | PASS |

## 按钮覆盖清单（地图页全部交互元素）

筛选片 全部+D1~D7 ✅｜图层切换 ✅｜定位 ✅｜搜索 ✅｜图钉（选中/切换/再点导航）✅｜气泡 ✅｜卡片体/导航箭头 ✅｜红书按钮 ✅｜高德规划全天路线 ✅｜空态：立即定位/去日程 ✅｜nav-bar 返回：组件内部不可达（automator 盲区，未改动代码），其行为由「跳地点页→navigateBack 返回」同通道覆盖 ✅

## GAP（记名，不阻塞）

1. **地图画布视觉**：本机开发者工具地图不上屏（automator 截图+OS 抓窗口均空白，**改版前旧验收截图同样如此**，环境问题先于本次改动存在）——markers/连线/序号的视觉终验须真机或用户侧开发者工具确认。重点看：序号是否居中针头（偏了调 `map.js` label `anchorY`（现 -34）/`anchorX`，真机异常可整段删 label 回退纯针，代码有注释）。
2. **真机**：不可自动化。真机预览检查清单：①D1~D7 图钉四色+序号居中 ②连线颜色/粗细 ③点图钉放大+气泡 ④再点跳微信导航 ⑤定位按钮出蓝点 ⑥单天筛选只剩当天连线 ⑦深色模式下面板/角标。

## 已知非阻塞现象

- `doDelete` callMethod 偶发桥超时（callMethod await 慢云写的已知形态）——删除实际完成，轮询证实列表已无该行程，PASS 判定基于轮询而非调用返回。
- cli auto `✖ preparing` 瞬态失败：强杀工具进程（`Get-Process 微信开发者工具 | Stop-Process -Force`，勿动 WeChatAppEx=微信本体）后重跑即愈。

## 工件

- 脚本：`work/accept-map-1025.mjs`（ONLY=M1/M2）、图标生成 `work/gen-map-markers.mjs`
- 结果 JSON：`work/verify-map-1025/accept-M1.json`、`accept-M2.json`（真实退出码 M1=0 M2=0）
- 截图：`work/verify-map-1025/m1-01-all.png`、`m1-02-selected.png`、`m2-01-empty.png`、`m3-01-long-smoke.png`（automator 截图仅 DOM 层可见，画布空白=上述 GAP1）、`devtools-map.png`（OS 级窗口抓图证据）
