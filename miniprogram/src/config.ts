/**
 * 服务端地址配置。
 *
 * - 开发（微信开发者工具）：直连本机 GoTrip 服务（npm run dev，:8787）。
 *   需在开发者工具「详情 → 本地设置」勾选「不校验合法域名…」。
 * - 生产：默认走微信云托管 callContainer 通道（免备案、免域名白名单，微信专线）。
 *   接入步骤见 docs/deploy-wxcloudrun.md：
 *   1) CLOUD_ENV 填云托管环境 ID（云托管控制台首页可见）
 *   2) 服务名与 WX_SERVICE 一致（控制台「服务列表 → 服务名称」）
 *   CLOUD_ENV 留空则回退直连 API_BASE（要求已备案域名且配好 request 合法域名）。
 */

const isDev = process.env.NODE_ENV === 'development'

/** 微信云托管环境 ID：留空 = 不使用云托管通道，直连 API_BASE */
export const CLOUD_ENV: string = 'gotrip-d7gh3d65l8b6d048e'

/** 云托管服务名（控制台服务列表中的名称） */
export const WX_SERVICE = 'gotrip'

/** 直连地址（开发本机 / 或未接云托管时的生产域名） */
export const API_BASE = isDev ? 'http://localhost:8787' : 'https://gotrip.pocketbay.app'

/** WebSocket（协作在线状态）：callContainer 不支持长连接，只能直连。
 *  开发连本机；生产用云托管默认域名 wss（测试期）或备案自定义域名（正式）。 */
export const WS_BASE = isDev ? 'ws://localhost:8787' : 'wss://gotrip.pocketbay.app'

/** 是否走 callContainer：仅生产且填了环境 ID 时生效，开发始终直连本机 */
export const USE_CLOUD = !isDev && CLOUD_ENV !== ''
