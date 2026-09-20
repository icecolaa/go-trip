import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'

export type ThemeMode = 'light' | 'dark' | 'auto'

const KEY = 'gotrip_theme'

/** 系统是否偏好深色（基础库 2.30.1+ 才有 theme 字段，拿不到就按浅色） */
function systemDark(): boolean {
  try {
    const info = Taro.getSystemInfoSync() as any
    return info?.theme === 'dark'
  } catch { return false }
}

function readStored(): ThemeMode {
  try {
    const v = Taro.getStorageSync(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch { /* ignore */ }
  return 'auto'
}

/**
 * 主题：auto 跟随系统，也可手动锁定浅/深，存 Taro.Storage。
 * 通过给 page 节点写 data-theme 让 WXSS 的 page[data-theme="dark"] 生效。
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStored)
  const resolved: 'light' | 'dark' = mode === 'auto' ? (systemDark() ? 'dark' : 'light') : mode

  useEffect(() => {
    try { Taro.setStorageSync(KEY, mode) } catch { /* ignore */ }
  }, [mode])

  // 系统主题变化（基础库 2.30.1+）
  useEffect(() => {
    const anyTaro = Taro as any
    if (typeof anyTaro.onThemeChange !== 'function') return
    const handler = () => setMode(m => (m === 'auto' ? 'auto' : m))
    anyTaro.onThemeChange(handler)
    return () => { if (typeof anyTaro.offThemeChange === 'function') anyTaro.offThemeChange(handler) }
  }, [])

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved])

  return { mode, resolved, setMode, toggle }
}
