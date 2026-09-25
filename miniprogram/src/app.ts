import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import { CLOUD_ENV, USE_CLOUD } from './config'
import './app.css'

function App({ children }: PropsWithChildren<any>) {
  // callContainer 前必须全局初始化一次云环境（仅 USE_CLOUD 时）
  useLaunch(() => {
    if (USE_CLOUD) {
      try { Taro.cloud.init({ env: CLOUD_ENV || undefined }) } catch { /* 已初始化等异常忽略 */ }
    }
  })
  return children
}

export default App
