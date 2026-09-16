/**
 * 服务端地址配置。
 *
 * - 开发（微信开发者工具）：默认指向本机 GoTrip 服务（npm run dev，:8787）。
 *   需在开发者工具「详情 → 本地设置」勾选「不校验合法域名…」。
 * - 生产：已备案域名（待办，见 miniprogram/README.md）。
 */

const isDev = process.env.NODE_ENV === 'development'

export const API_BASE = isDev ? 'http://localhost:8787' : 'https://gotrip.pocketbay.app'

export const WS_BASE = isDev ? 'ws://localhost:8787' : 'wss://gotrip.pocketbay.app'
