# 007 · 质感打磨包（L1+L2+加分项）

> 基线 commit：2e5c5e5。六件低风险高感知的小件：按压反馈、工作台首屏 stagger、主题切换平滑过渡、删除行程退场、trip-switch 呼吸点、卡片 hover 投影。日卡 `<details>` 展开过渡**暂缓**（`::details-content` 浏览器支持面不足，待基线升级后单开计划）。

## 改动文件
`client/src/styles.css`、`client/src/theme.ts`、`client/src/pages/DashboardPage.tsx`

### A. 按压反馈（L1，styles.css）
现行：
```css
  transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform .1s ease;
  ...
.btn:active:not(:disabled) { transform: translateY(1px); }
```
目标（.btn 的 transition 行 + :active 行各改一处）：
```css
  transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform 160ms var(--ease-out);
  ...
.btn:active:not(:disabled) { transform: scale(0.97); }
```

### B. 工作台首屏 stagger（L2，styles.css 末尾追加）
```css
/* ---------- 工作台卡片入场 stagger（仅挂载时，筛选不重放） ---------- */
@keyframes cardIn { from { opacity: 0; transform: translateY(8px); } }
.trip-grid .trip-card { animation: cardIn var(--dur-ui) var(--ease-out) backwards; }
.trip-grid .trip-card:nth-child(2) { animation-delay: 40ms; }
.trip-grid .trip-card:nth-child(3) { animation-delay: 80ms; }
.trip-grid .trip-card:nth-child(n+4) { animation-delay: 120ms; }
```

### C. 主题切换平滑过渡（theme.ts + styles.css）
`client/src/theme.ts` 的 `applyTheme` 现行：
```ts
export function applyTheme(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0D1626' : '#F3F8FC');
}
```
（meta 色值以文件实际为准——若为 `#000000`/`#f5f5f7` 等旧值一并更新为新令牌值。）目标：
```ts
export function applyTheme(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;
  // 一次性过渡窗口：色面 200ms 平滑切换，结束即摘避免常驻 * 过渡
  root.classList.add('theme-anim');
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  window.setTimeout(() => root.classList.remove('theme-anim'), 240);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0D1626' : '#F3F8FC');
}
```
styles.css 末尾追加：
```css
html.theme-anim, html.theme-anim * {
  transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease !important;
}
```
（窗口仅 240ms、只过渡色三属性、不带 transform——短期 * 过渡是换主题的标准做法；033 计划的 reduced-motion 下该过渡也应失效，在 003 的媒体查询内补 `html.theme-anim, html.theme-anim * { transition-duration: 0.01ms !important; }`。）

### D. 删除行程退场（DashboardPage.tsx）
`removeTrip` 现行（确认后直接删）：
```ts
    if (!window.confirm(`删除行程「${t.title}」？\n行程、安排、账目、清单、日志等全部数据将一并删除，不可恢复。`)) return;
    try {
      await deleteTrip(t.id);
```
目标：确认后先给卡片加退场类，160ms 后再发删除请求：
```ts
    if (!window.confirm(`删除行程「${t.title}」？\n行程、安排、账目、清单、日志等全部数据将一并删除，不可恢复。`)) return;
    const el = document.querySelector<HTMLElement>(`[data-trip-id="${t.id}"]`);
    if (el) { el.style.transition = 'opacity 160ms var(--ease-out), transform 160ms var(--ease-out)'; el.style.opacity = '0'; el.style.transform = 'scale(0.97)'; await new Promise(r => setTimeout(r, 160)); }
    try {
      await deleteTrip(t.id);
```
TripCard 根节点补 `data-trip-id={t.id}`：
```tsx
    <div className="card trip-card" data-trip-id={t.id} onClick={onClick}>
```

### E. trip-switch 呼吸点（styles.css；与现行 `.trip-switch .live` 同段追加）
```css
.trip-switch .live { position: relative; }
.trip-switch .live::after {
  content: ''; position: absolute; inset: -3px; border-radius: 50%;
  background: var(--green); opacity: 0; pointer-events: none;
  animation: livePulse 2.4s var(--ease-in-out) infinite;
}
@keyframes livePulse { 50% { opacity: .35; } }
```
（ring 用 opacity 合成路径；033 计划已把它列入 reduced-motion 停止清单。）

### F. 卡片 hover 投影（styles.css）
现行：
```css
.trip-card { overflow: hidden; display: flex; flex-direction: column; cursor: pointer; transition: border-color .18s ease; }
.trip-card:hover { border-color: var(--line-strong); }
```
目标：
```css
.trip-card { overflow: hidden; display: flex; flex-direction: column; cursor: pointer; transition: border-color .2s var(--ease-out), box-shadow .2s var(--ease-out); }
.trip-card:hover { border-color: var(--sky300); box-shadow: var(--sh-card); }
```
（晴空航线蓝调投影令牌现成；hover 单元素 box-shadow 过渡可接受。）

## 步骤（执行序）
1. A（按压）→ F（hover 投影）→ E（呼吸点）→ B（stagger）——纯 CSS 依次落。
2. C（theme.ts）+ styles.css 过渡类 + **回填 003 的 reduced-motion 补条**。
3. D（删除退场，唯一 TSX 逻辑改动）。
4. `npx tsc --noEmit` 必须绿。

## 范围边界
- **不做**日卡 `<details>` 展开动画（::details-content 支持面不足，暂缓）。
- stagger 只给工作台卡片区；不给账单表格/清单加（密度区不加戏）。
- 删除退场只在 confirm 之后发生（用户已拍板删除，160ms 是系统回应非阻挡）。

## 验证
1. `npx tsc --noEmit` 绿。
2. 浏览器过一遍：
   - 按住任意主按钮：轻微缩放（0.97）非下移；
   - 刷新工作台：卡片 0/40/80/120ms 依次浮现；
   - 顶栏 🌙 切换：全屏颜色 200ms 平滑换装（无瞬跳）；连点三次不粘滞（240ms 窗口摘除）；
   - hover 行程卡：蓝边+浅投影同步浮起；
   - 删除一段行程：卡片先淡缩退场再消失，列表无跳变感；
   - 顶栏「选择旅程」绿点：2.4s 周期呼吸。
3. reduced-motion 模拟：换主题瞬切、stagger 无位移、呼吸点静止。
