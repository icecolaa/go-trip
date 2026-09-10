/**
 * GoTrip 线上保活脚本
 * 用法：
 *   node scripts/keepalive.mjs            # 默认每 4 分钟心跳一次
 *   node scripts/keepalive.mjs 2          # 自定义间隔（分钟）
 *   GOTRIP_KEEPALIVE_URL=... node ...     # 自定义目标地址
 * 停止：Ctrl+C
 *
 * PocketBay 免费托管在闲置一段时间后会回收实例（休眠），下次访问需重新唤醒。
 * 定时心跳可让应用在你使用期间保持在线。不需要全天挂机——用完 Ctrl+C 停掉即可。
 */
const URL = process.env.GOTRIP_KEEPALIVE_URL || 'https://gotrip--e.pocketbay.app/health';
const INTERVAL_MIN = Number(process.argv[2]) || 4;
const INTERVAL_MS = INTERVAL_MIN * 60 * 1000;

let okCount = 0, failCount = 0;

async function ping() {
  const t0 = Date.now();
  try {
    const resp = await fetch(URL, { signal: AbortSignal.timeout(15000) });
    const ms = Date.now() - t0;
    const body = (await resp.text().catch(() => '')).trim();
    if (resp.ok && body.includes('"ok"')) {
      okCount++;
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ✓ 在线 ${ms}ms（连续正常 ${okCount}）`);
    } else if (resp.status === 204 || !body) {
      // 204/空响应 = 平台休眠壳层：请求主页触发唤醒流程
      failCount++;
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ⏳ 应用休眠中，请求主页触发唤醒…`);
      await fetch(URL.replace('/health', '/'), { signal: AbortSignal.timeout(25000) }).catch(() => {});
      console.log(`    （唤醒需 10~30 秒，下一轮心跳确认）`);
    } else {
      failCount++;
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ! HTTP ${resp.status} ${body.slice(0, 40)}`);
    }
  } catch (e) {
    failCount++;
    console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ✗ ${e.name}: ${String(e.message).slice(0, 60)}`);
  }
  console.log(`    累计 成功${okCount} / 异常${failCount}`);
}

console.log(`🫀 GoTrip 保活已启动 → ${URL}`);
console.log(`   每 ${INTERVAL_MIN} 分钟心跳一次，Ctrl+C 停止`);
await ping();
setInterval(ping, INTERVAL_MS);
