/**
 * 服务端地址配置。
 *
 * - 开发（微信开发者工具）：直连本机 GoTrip 服务（npm run dev，:8787）。
 *   需在开发者工具「详情 → 本地设置」勾选「不校验合法域名…」。
 * - 生产：走微信云托管 callContainer 通道（免备案、免域名白名单，微信专线）。
 *   接入步骤见 docs/deploy-wxcloudrun.md：
 *   1) CLOUD_ENV = 云托管环境 ID（控制台首页/工单信息可见）
 *   2) WX_SERVICE = 云托管服务名（控制台「服务列表 → 服务名称」）
 *   CLOUD_ENV 留空则回退直连 API_BASE（要求已备案域名且配好 request 合法域名）。
 */

const isDev = process.env.NODE_ENV === 'development'

/** 腾讯云 CloudBase 环境 ID（gotrip 环境，云开发自带 SQL 实例 gotrip-d7gh3d65l8b6d048e）。
 *  旧环境 prod-9g9b12cyd5f63833 已停用，勿再改回去。 */
export const CLOUD_ENV = 'gotrip-d7gh3d65l8b6d048e'

/** 云托管服务名（GoTrip 主服务） */
export const WX_SERVICE = 'gotrip'

/** 直连地址（开发本机 / 或未接云托管时的生产域名） */
export const API_BASE = isDev ? 'http://localhost:8787' : 'https://gotrip.pocketbay.app'

/** WebSocket（协作在线状态）。
 *
 *  生产态走 `wx.cloud.connectContainer` 专线（见 api/ws.ts）——不需要自定义域名、
 *  也不需要开公网访问，所以这里只服务本地开发/直连模式。
 *  要求基础库 ≥ 2.21.1。本地开发填 ws://localhost:8787，直连模式未配置时留空即可（不会发起连接）。 */
export const WS_BASE = isDev
  ? 'ws://localhost:8787'
  : ''

/** 是否走 callContainer：仅生产且填了环境 ID 时生效，开发始终直连本机 */
export const USE_CLOUD = !isDev && CLOUD_ENV.length > 0
