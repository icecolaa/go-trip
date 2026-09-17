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

/** 微信云托管环境 ID（prod 环境） */
export const CLOUD_ENV = 'prod-9g9b12cyd5f63833'

/** 云托管服务名（GoTrip 主服务；express-yo4c 是早期的 Express 模板占位服务，待删除） */
export const WX_SERVICE = 'gotrip'

/** 直连地址（开发本机 / 或未接云托管时的生产域名） */
export const API_BASE = isDev ? 'http://localhost:8787' : 'https://gotrip.pocketbay.app'

/** WebSocket（协作在线状态）：callContainer 不支持长连接，只能直连。
 *  测试期用云托管服务默认域名 wss；正式换备案自定义域名并同步改 socket 合法域名。 */
export const WS_BASE = isDev
  ? 'ws://localhost:8787'
  : 'wss://gotrip-1509709-1308923163.ap-shanghai.run.tcloudbase.com'

/** 是否走 callContainer：仅生产且填了环境 ID 时生效，开发始终直连本机 */
export const USE_CLOUD = !isDev && CLOUD_ENV !== ''
