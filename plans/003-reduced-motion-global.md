# 003 · prefers-reduced-motion 全局降级（H3）

> 基线 commit：2e5c5e5。全库 0 处 `prefers-reduced-motion`。规范：减弱而非清零——保留 opacity/色彩反馈，去掉位移与无限装饰动画；加载指示（spin）保留。

## 改动文件
`client/src/styles.css`

## 目标代码（追加到 styles.css 末尾）
```css
/* ---------- 无障碍：prefers-reduced-motion（减弱而非清零） ---------- */
@media (prefers-reduced-motion: reduce) {
  /* 入场/弹层类：瞬时呈现（保留出现本身，去掉位移与时长） */
  .modal-mask, .modal, .toast, .tab-pane, .tm-overlay, .tm-panel, .ua-panel, .journal-lightbox {
    animation-duration: 0.01ms !important;
  }
  /* 纯装饰无限动画：停止（骨架微光/AI 呼吸/地图 ring） */
  .skel::after, .ai-progress, .map-place-card.flash::after, .trip-switch .live::after {
    animation: none !important;
  }
  /* 动效令牌全面降为瞬时（覆盖 004 引入的 transition-duration 引用） */
  :root { --dur-fast: 0.01ms; --dur-ui: 0.01ms; --dur-panel: 0.01ms; }
}
```

## 步骤
1. 依赖：004（令牌存在才可覆盖）、005（`.map-place-card.flash::after`）、007（`.trip-switch .live::after`）——若本计划先执行，先写入前两条，第三条与后两条随对应计划落地时已兼容（覆盖写在同一媒体查询内即可，最终以本文件为准合并）。
2. 追加到 styles.css 末尾，保持文件头注释风格。

## 范围边界
- **保留** `.spin`（加载指示）与 `.ua-dots i`（输入中提示）——转动/闪烁是状态必需，且非位移。
- 不用 `* { animation: none }` 全核弹（会把加载指示一起杀掉）。

## 验证
1. Chrome DevTools → Rendering → Emulate CSS media `prefers-reduced-motion: reduce`：
   - 打开创建旅程弹窗：立即出现（无缩放入场）；
   - 骨架屏：静止色块（无微光扫过）；
   - 页面加载 spinner：仍在转。
2. 取消模拟后一切恢复。
