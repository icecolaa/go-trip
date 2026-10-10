# 001 · Toast 入场可中断化（H1）

> 基线 commit：2e5c5e5。Toast 高频连发（验收实测一次操作连出 2~3 条），现行 `popIn` keyframes 每条从零重放、连发时跳帧。改为 CSS transition + `@starting-style`（Chrome 117+/Safari 17.5+；不支持的浏览器直接显示，优雅降级），零 TSX 改动。

## 改动文件
`client/src/styles.css`

## 现行代码（精确摘录）
```css
.toast {
  background: var(--ink); color: var(--bg); font-size: 13.5px; padding: 9px 18px; border-radius: var(--radius-ctl);
  animation: popIn .18s ease; max-width: 90vw;
}
```

## 目标代码
```css
.toast {
  background: var(--ink); color: var(--bg); font-size: 13.5px; padding: 9px 18px; border-radius: var(--radius-ctl);
  max-width: 90vw;
  transition: opacity .18s var(--ease-out), transform .18s var(--ease-out);
}
@starting-style {
  .toast { opacity: 0; transform: translateY(-6px) scale(.97); }
}
```

## 步骤
1. 依赖：先完成 004（`--ease-out` 令牌）。
2. 将 `.toast` 规则中的 `animation: popIn .18s ease;` 行删除，加入上面的 `transition` 行。
3. 在 `.toast.err` 规则之后新增 `@starting-style` 块（保持缩进风格两空格）。
4. **不要**动 `@keyframes popIn`——`.modal` 仍在消费它。

## 范围边界
- 不改 `ui.tsx` 的 Toasts 组件（退场是数组移除，瞬时消失可接受；入场才是体验面）。
- 不改 `.toast-wrap`。

## 验证
1. `npx tsc --noEmit` 通过（纯 CSS 无类型影响，仍跑一遍防意外）。
2. 浏览器实测：预算页空值提交→连点三次「保存」造 3 条 toast——三条依次滑入、无跳帧、无从零闪现。
3. 慢动作自查：DevTools → Rendering → 勾选 Emulate CSS media `prefers-reduced-motion` 无关；直接目测入场是否「从上方 6px 滑入并淡显」，不应有任何从零缩放感。
