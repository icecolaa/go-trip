# 002 · Tab 切换入场动画降频（H2）

> 基线 commit：2e5c5e5。`.tab-pane` 每次切换 tab 都重放 280ms 位移入场——行程工作台 tab 切换是每天几十上百次的动作，按频率规范应删除或大幅缩减。取「缩减」：保留纯 opacity 淡显（状态变化信号），去掉位移。

## 改动文件
`client/src/styles.css`

## 现行代码（精确摘录）
```css
.tab-pane { animation: riseIn .28s ease; }
@keyframes riseIn { from { opacity: 0; transform: translateY(10px); } }
```

## 目标代码
```css
.tab-pane { animation: fadeIn .15s var(--ease-out); }
```
并删除 `@keyframes riseIn` 整行（全库 grep `riseIn` 确认无其他消费方后删）。

## 步骤
1. 依赖：004（`--ease-out`）。`fadeIn` keyframe 已存在（`from { opacity: 0; }`，.modal-mask 等在用），直接复用。
2. 替换 `.tab-pane` 行为上面目标代码。
3. `grep -n "riseIn" client/src/styles.css` 确认只剩定义行后，删除定义行。

## 范围边界
- 不动 `.tab-pane { scroll-margin-top: 108px; }` 等其它 tab-pane 规则。
- 不给 tab 切换加任何位移或 stagger——高频动作不加戏。

## 验证
1. 浏览器：行程页在 12 个 tab 间快速连续点击——内容淡显切换、无位移感、无卡顿。
2. `grep -n "riseIn"` 零命中。
