# 004 · 动效令牌 + 弹层缓动统一（M1）

> 基线 commit：2e5c5e5。全库入场动画一律内置 `ease`（弱缓动），零动效令牌。建令牌并应用到全部弹层入场，后续计划（001/002/005/007）统一引用。

## 改动文件
`client/src/styles.css`

## 现行代码（精确摘录，四处入场全用内置 ease）
```css
.modal-mask { ...; animation: fadeIn .15s ease; }
.modal { ...; animation: popIn .18s ease; }
.tm-panel { ...; animation: tmIn .22s ease; }
.ua-panel { ...; animation: uaIn .2s ease; }
```

## 目标令牌（加进 `:root` 块内、`--r-sm` 之后）
```css
  /* 动效令牌（AUDIT.md 标准值）：入场用强 ease-out，抽屉类用 iOS 曲线 */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --dur-fast: 150ms;
  --dur-ui: 200ms;
  --dur-panel: 240ms;
```
深色块 `html[data-theme="dark"]` 不需要覆盖（缓动与主题无关）。

## 目标替换（四处）
```css
.modal-mask { ...; animation: fadeIn .15s var(--ease-out); }
.modal { ...; animation: popIn var(--dur-ui) var(--ease-out); }
.tm-panel { ...; animation: tmIn var(--dur-panel) var(--ease-drawer); }
.ua-panel { ...; animation: uaIn var(--dur-ui) var(--ease-out); }
```
（`...` 表示该规则其余声明原样保留；只动 animation 一行。）

## 步骤
1. `:root` 加令牌块。
2. 逐条替换四处 animation（modal-mask/modal/tm-panel/ua-panel），其余声明不动。
3. `grep -n "\.18s ease\|\.22s ease\|\.2s ease\b" client/src/styles.css` 复查是否还有入场类内置 ease 残留（hover 色变 `.15s ease` 属规范允许的「hover/色彩用 ease」，**不改**）。

## 范围边界
- 只动「入场/弹层」动画的缓动；hover 色变过渡保留 `ease`（AUDIT.md 决策序：hover/色彩 → ease）。
- 不改 keyframes 本身（popIn/tmIn/uaIn 的起始形不变——均非 scale(0)，合规）。

## 验证
1. 浏览器：打开创建弹窗、出发模式、使用助手面板——入场「快起缓收」，无生硬顿感；抽屉（出发模式）有 iOS 式滑入感。
2. 慢动作（DevTools Animations 面板 0.5x）：曲线前段快、尾段缓，无对称 S 形。
