import Taro from '@tarojs/taro'
import { CLOUD_ENV, WX_SERVICE, USE_CLOUD, WS_BASE } from '../config'
import { getToken } from './request'

/**
 * WebSocket 协作通道封装（对应服务端 /ws?token=）。
 *
 * 服务端消息：{ type: 'presence'|'change'|'location', tripId, ... }
 * 首次连接后发送 { type: 'subscribe', tripId } 订阅房间；每 15s 心跳。
 *
 * 两条通道：
 *  - 生产（USE_CLOUD）：走 `wx.cloud.connectContainer`，WebSocket 借 callContainer 专线进出，
 *    **不需要自定义域名、公网访问可以一直关着**（x-wx-openid 安全边界得以保留）。
 *    要求基础库 ≥ 2.21.1。注意 iOS 高性能+模式下该通道不带微信身份，但我们的鉴权走
 *    URL 里的 token，不依赖 x-wx-openid，所以不受影响。
 *  - 开发/未接云：`Taro.connectSocket` 直连 WS_BASE（本地 ws://localhost:8787）。
 */

let task: Taro.SocketTask | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null
let currentTripId: number | null = null

export async function connectWS(tripId: number, onChange?: (msg: any) => void): Promise<void> {
  closeWS()
  currentTripId = tripId
  const token = getToken()
  if (!token) return

  if (USE_CLOUD) {
    // 云托管通道：token 走 path 查询串（服务端 tokenFromRequest 认 ?token=）
    // Taro 未给 cloud 收录 connectContainer 类型，整体转型（与 request.ts 的 callContainer 同思路）
    const cloud = Taro.cloud as any
    try {
      const res = await cloud.connectContainer({
        config: { env: CLOUD_ENV },
        service: WX_SERVICE,
        path: `/ws?token=${encodeURIComponent(token)}`,
      })
      task = res?.socketTask || null
    } catch {
      task = null
    }
  } else {
    // 开发/直连通道：未配置域名就不连，避免每次发起一个坏连接刷报错
    if (!WS_BASE) return
    try {
      task = await Taro.connectSocket({
        url: `${WS_BASE}/ws?token=${token}`,
        fail: () => { task = null },
      })
    } catch {
      task = null
    }
  }
  if (!task) return

  task.onOpen(() => {
    task?.send({ data: JSON.stringify({ type: 'subscribe', tripId }) })
    heartbeat = setInterval(() => {
      task?.send({ data: JSON.stringify({ type: 'heartbeat' }) })
    }, 15000)
  })
  task.onMessage((res: any) => {
    try {
      const msg = JSON.parse(res.data as string)
      if (msg.tripId === currentTripId) onChange?.(msg)
    } catch {
      /* 非 JSON 忽略 */
    }
  })
  task.onClose(() => {
    task = null
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
  })
  task.onError(() => {
    task = null
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
  })
}

export function closeWS(): void {
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
  if (task) {
    try { task.close({}) } catch { /* 已关闭忽略 */ }
    task = null
  }
}
