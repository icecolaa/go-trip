# 006 · 触屏 hover 卫生（M3）

> 基线 commit：2e5c5e5。审计结论：005 落地后全库**没有位移类 hover 过渡残留**（按钮/卡片/侧边栏 hover 均为纯色变，规范允许且触屏无害）。本计划收尾两件真实的触屏卫生：①全局去 tap 高亮闪（已有 @media(hover:none) 块但只覆盖部分选择器）②reveal 型按钮（编辑/删除/删除链接钮）在触屏的常显已被既有 `@media (hover:none)` 覆盖——补漏 `.trip-del-btn` 之外的漏网者并验证。

## 改动文件
`client/src/styles.css`

## 现状盘点（执行前先跑）
```bash
grep -n "@media (hover: none)" client/src/styles.css
grep -n "tap-highlight" client/src/styles.css
```
已知存在：`.trip-edit-btn`、`.trip-del-btn`、`.hb-del`、`.link-del`、`.act-ops` 五处 reveal 钮均有 `@media (hover: none) { ... opacity: ... }`。

## 目标代码（追加到既有触屏基础体验块 `@media (hover: none)` 内）
```css
@media (hover: none) {
  button, a, .chip, .poi-item { -webkit-tap-highlight-color: transparent; } /* 已存在则跳过 */
  .trip-nav a, .member-card, .place-item, .hb-card, .link-card, .tbl tr:hover td {
    /* 触屏上清除 hover 残留底色 */
  }
}
```
实际需要写入的只有一行（若 grep 显示 tap-highlight 缺失）：
```css
  .trip-nav a, .tbl tr:hover td { -webkit-tap-highlight-color: transparent; }
```
`.tbl tr:hover td { background: var(--sky50); }` 保持不动——移动端点行不产生持续 hover，无需处理。

## 步骤
1. 跑现状盘点 grep，确认五个 reveal 钮的 hover:none 覆盖齐全（缺哪个补哪个，形态照抄 `.trip-edit-btn` 的 `@media (hover: none) { .xxx { opacity: .9; } }`）。
2. tap-highlight 行若已存在则本计划零改动收尾（审计结论如实记录）。

## 范围边界
- **不给纯色变 hover 加门控**——规范只要求位移类 hover 门控；色变 hover 在触屏是瞬时无害的。
- 不引入 `@media (hover: hover)` 包裹既有色变 hover（改动面大、收益零）。

## 验证
1. DevTools 设备模拟（触屏）点按钮：无半透明灰闪块。
2. 桌面 hover 行为回归：按钮/侧边栏/卡片色变照常。
