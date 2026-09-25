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
/** Taro 构建时会注入 process.env.TARO_ENV：h5 / weapp / ... */
const isH5 = process.env.TARO_ENV === 'h5'

/** 微信云托管环境 ID：留空 = 不使用云托管通道，直连 API_BASE */
export const CLOUD_ENV: string = 'gotrip-d1gb187o991f5260a'

/** 云托管服务名（控制台服务列表中的名称） */
export const WX_SERVICE = 'gotrip'

/** 云托管公网默认域名（浏览器 HTTPS 直连用，H5 静态托管跨域访问此地址） */
export const CLOUD_RUN_URL = 'https://gotrip-gotrip-d1gb187o991f5260a-1308923163.ap-shanghai.run.wxcloudrun.com'

/**
 * 直连地址：
 * - 开发：本机 :8787
 * - H5 生产：浏览器没有 callContainer，只能 HTTPS 直连云托管公网域名（后端需开 CORS）
 * - 小程序生产：走 callContainer，这里填备案自定义域名（未备案也不会用到，仅作兜底）
 */
export const API_BASE = isDev
  ? 'http://localhost:8787'
  : isH5
    ? CLOUD_RUN_URL
    : 'https://gotrip.pocketbay.app'

/** WebSocket（协作在线状态）：callContainer 不支持长连接，只能直连。
 *  开发连本机；H5 走云托管公网 wss；小程序生产用备案自定义域名。 */
export const WS_BASE = isDev
  ? 'ws://localhost:8787'
  : isH5
    ? CLOUD_RUN_URL.replace(/^http/, 'ws')
    : 'wss://gotrip.pocketbay.app'

/** 是否走 callContainer：仅生产小程序且填了环境 ID 时生效；H5 浏览器一律直连 */
export const USE_CLOUD = !isDev && !isH5 && CLOUD_ENV !== ''
