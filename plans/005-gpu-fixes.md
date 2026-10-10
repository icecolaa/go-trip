# 005 · GPU 化两处非合成动画（M2）

> 基线 commit：2e5c5e5。两处动画触非 GPU 属性：①`placeFlash` 逐帧动画 box-shadow；②`.ua-restore:hover` 动画 width（布局属性）。全部改 transform/opacity。

## 改动文件
`client/src/styles.css`

## A. placeFlash（地图地点卡高亮 ring）

### 现行代码
```css
.map-place-card { scroll-margin-top: 96px; }
.map-place-card.flash { animation: placeFlash 1.6s ease; }
@keyframes placeFlash {
  0%, 100% { box-shadow: none; }
  15%, 65% { box-shadow: 0 0 0 3px var(--accent); }
}
```

### 目标代码
```css
.map-place-card { scroll-margin-top: 96px; position: relative; }
.map-place-card.flash::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 0 0 3px var(--accent); opacity: 0; pointer-events: none;
  animation: placeRing 1.6s var(--ease-out);
}
@keyframes placeRing {
  0%, 100% { opacity: 0; }
  15%, 65% { opacity: 1; }
}
```
（box-shadow 只画一次、动画走 opacity——合成器路径。旧 `placeFlash` keyframes 删除。JS 侧加 `.flash` 类的触发逻辑不变。）

## B. ua-restore 悬停展宽

### 现行代码
```css
  transition: opacity .15s ease, width .15s ease;
}
.ua-restore:hover { opacity: 1; width: 32px; }
```

### 目标代码
```css
  transition: opacity .15s ease, transform .15s ease;
}
.ua-restore:hover { opacity: 1; transform: translateX(-6px); }
```
（元素右缘贴屏 `right: 0`、宽 26px：hover 展宽 32px 的视觉=向左探出 6px，用 translateX(-6px) 等效表达；宽度恒定 32px、常态右移被屏幕裁掉的部分不变——需把常态规则里 `width: 26px` 改为 `width: 32px`，视觉通过 transform 补偿。若执行时发现常态露出 6px 空白，改用 `transform: translateX(6px)` 常态 + hover 归零，二选一以「常态视觉与改动前完全一致」为准。）

## 步骤
1. 依赖：004（`--ease-out`）。
2. 按 A 替换 placeFlash 段并删旧 keyframes；grep `placeFlash` 确认无残留引用。
3. 按 B 改 ua-restore（transition 行 + hover 行 + 常态 width）。

## 范围边界
- 不动 MapTab.tsx（flash 类的加/除逻辑原样）。
- 不顺手改其它 box-shadow 过渡（trip-card hover 投影属 007）。

## 验证
1. DevTools → Rendering → Paint flashing 开启：触发地图地点卡联动高亮——ring 闪现期间不应出现整卡绿色重绘闪烁（只有合成层）。
2. 使用助手 FAB 关闭后悬停右缘恢复钮：展开动画无布局抖动（Elements 面板 width 恒定）。
