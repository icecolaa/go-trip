import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import { CLOUD_ENV } from './config'
import { rdbClient } from './rdb/client'
import './app.css'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    // wx.cloud.init：callContainer 与数据模型 SDK 共用；失败重试由调用方兜底
    try { Taro.cloud.init({ env: CLOUD_ENV || undefined }) } catch { /* 已初始化等异常忽略 */ }
    try { rdbClient() } catch { /* 环境异常时页面调用再报错 */ }
  })
  return children
}

export default App
