import Taro from '@tarojs/taro'
import { WS_BASE } from '../config'
import { getToken } from './request'

/**
 * WebSocket 协作通道封装（对应服务端 /ws?token=）。
 *
 * 服务端消息：{ type: 'presence'|'change'|'location', tripId, ... }
 * 首次连接后发送 { type: 'subscribe', tripId } 订阅房间；每 15s 心跳。
 */

let task: Taro.SocketTask | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null
let currentTripId: number | null = null

export async function connectWS(tripId: number, onChange?: (msg: any) => void): Promise<void> {
  closeWS()
  currentTripId = tripId
  const token = getToken()
  if (!token) return
  // 未配置 WS 域名（等备案自定义域名）时直接不连，避免每次都发起一个坏连接刷报错
  if (!WS_BASE) return

  try {
    task = await Taro.connectSocket({
      url: `${WS_BASE}/ws?token=${token}`,
      fail: () => {
        task = null
      },
    })
  } catch {
    task = null
  }
  if (!task) return

  task.onOpen(() => {
    task?.send({ data: JSON.stringify({ type: 'subscribe', tripId }) })
    heartbeat = setInterval(() => {
      task?.send({ data: JSON.stringify({ type: 'heartbeat' }) })
    }, 15000)
  })
  task.onMessage((res) => {
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
