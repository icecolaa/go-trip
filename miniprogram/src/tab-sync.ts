/** tab 页选中态同步（独立模块：避免页面 chunk 对 custom-tab-bar 异步 chunk 的依赖竞态——
 * useDidShow 里直接 import custom-tab-bar 会在 chunk 加载完成前拿到 undefined 导致调用抛错）。
 * 任何异常都不允许打断页面 load 流程。 */
import Taro from '@tarojs/taro'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function syncTabBar(index: number): void {
  try {
    const page = Taro.getCurrentInstance().page as any
    const bar = page?.getTabBar?.()
    if (bar && typeof bar.setSelected === 'function') bar.setSelected(index)
  } catch (e) {
    try { console.warn('syncTabBar skipped:', (e as any)?.message || e) } catch (e2) { /* ignore */ }
  }
}
