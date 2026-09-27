/** tab 页选中态同步（独立模块：避免页面 chunk 对 custom-tab-bar 异步 chunk 的依赖竞态——
 * useDidShow 里直接 import custom-tab-bar 会在 chunk 加载完成前拿到 undefined 导致调用抛错）。
 * 任何异常都不允许打断页面 load 流程。 */
import Taro from '@tarojs/taro'

declare const wx: any

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 每个自定义 tab 组件实例挂载时读上次的选中态（switchTab 重建实例时立即正确显示，不等 useDidShow） */
export function initialTab(): number {
  try {
    const n = Number(wx.getStorageSync('gotrip:tab-index'))
    return n >= 0 && n < 3 ? n : 0
  } catch (e) {
    return 0
  }
}

export function syncTabBar(index: number): void {
  try {
    wx.setStorageSync('gotrip:tab-index', index)
    const page = Taro.getCurrentInstance().page as any
    const bar = page?.getTabBar?.()
    if (!bar) return
    // Taro 3.6 + React：getTabBar() 返回原生组件包装器（无类方法），
    // React 实例挂在 $taroInstances 上（state/setState 所在）。
    if (typeof bar.setSelected === 'function') {
      bar.setSelected(index)
    } else if (bar.$taroInstances && typeof bar.$taroInstances.setSelected === 'function') {
      bar.$taroInstances.setSelected(index)
    }
  } catch (e) {
    try { console.warn('syncTabBar skipped:', (e as any)?.message || e) } catch (e2) { /* ignore */ }
  }
}
