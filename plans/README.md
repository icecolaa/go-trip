# 动效质感升级计划（2026-10-10，基线 2e5c5e5）

来源：review-animations + improve-animations 双审计（结论=Block）。用户拍板全包。

## 执行顺序（依赖关系）

| 顺序 | 计划 | 依赖 | 状态 |
|---|---|---|---|
| 1 | [004 动效令牌](004-motion-tokens.md) | 无（其余全部引用其令牌） | DONE |
| 2 | [001 Toast 可中断化](001-toast-interruptible-entry.md) | 004 | DONE |
| 3 | [002 Tab 切换降频](002-tab-pane-entrance.md) | 004 | DONE |
| 4 | [005 GPU 化](005-gpu-fixes.md) | 004 | DONE |
| 5 | [003 reduced-motion](003-reduced-motion-global.md) | 004/005/007 的类名 | DONE |
| 6 | [006 触屏 hover 卫生](006-touch-hover-hygiene.md) | 005 | DONE（tap-highlight 已有，审计如实记录） |
| 7 | [007 质感打磨包](007-polish-pack.md) | 003/004 回填 | DONE |

## 执行方式
单批实现（同一次提交），完成后 `npx tsc --noEmit` + 浏览器过 007 的验证清单 + reduced-motion 模拟抽查，再构建部署。

## 遗留
- 日卡 `<details>` 展开过渡：暂缓（`::details-content` 支持面不足）。
- AI 真回复：卡 GLM 账户余额（429 code 1113），非本批范围。
