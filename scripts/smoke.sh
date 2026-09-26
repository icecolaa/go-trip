#!/bin/bash
# GoTrip 冒烟（rdb 直连架构，2026-09-26）：
#   A. 容器代理面（/health + x-wx-source 门槛 + AI/POI/天气代理）
#   B. 静态检查（shared 纯函数）
# 旧 111 项 CRUD 冒烟随数据层迁 CloudBase 数据模型而退役（客户端直连，无法从脚本侧伪造微信身份）。
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
BASE=${SMOKE_BASE:-http://localhost:8787}
PASS=0; FAIL=0

check() {
  local name="$1" actual="$2" expect="$3"
  if echo "$actual" | grep -qE "$expect"; then
    PASS=$((PASS+1)); echo "PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $name  => $(echo "$actual" | head -c 260)"
  fi
}

echo "== A1. 健康 / 门槛 =="
check "health 200 proxy 模式" "$(curl -s -m 5 $BASE/health)" '"mode":"proxy"'
check "无 x-wx-source 一律 403" "$(curl -s -m 5 -o /dev/null -w '%{http_code}' $BASE/api/ai/status)" '^403$'
check "带 x-wx-source 可达" "$(curl -s -m 5 $BASE/api/ai/status -H 'x-wx-source: wx')" 'configured'
check "旧 CRUD 路由已删(404)" "$(curl -s -m 5 -o /dev/null -w '%{http_code}' $BASE/api/trips -H 'x-wx-source: wx')" '^404$'
check "伪造 openid 无 source 仍 403" "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST $BASE/api/assistant -H 'Content-Type: application/json' -H 'x-wx-openid: ofake' -d '{"history":[]}')" '^403$'

echo "== A2. 代理端点 =="
check "POI 兜底(内置库)" "$(curl -s -m 15 "$BASE/api/poi/search?q=%E6%B4%B1%E6%B5%B7&city=%E5%A4%A7%E7%90%86" -H 'x-wx-source: wx')" '"source"'
check "天气代理(Open-Meteo)" "$(curl -s -m 15 "$BASE/api/weather?place=%E5%A4%A7%E7%90%86&dates=2026-10-05" -H 'x-wx-source: wx')" 'tempMax'
check "锦囊生成(内置兜底)" "$(printf '{"city":"大理","days":2,"interests":[]}' > /tmp/gt_hb.json; curl -s -m 60 -X POST $BASE/api/trips/1/handbook/generate -H 'Content-Type: application/json' -H 'x-wx-source: wx' --data-binary @/tmp/gt_hb.json)" '"title"'
check "geocode 端点结构" "$(printf '{"items":[{"id":"a1","title":"洱海","place":""}]}' > /tmp/gt_gc.json; curl -s -m 30 -X POST $BASE/api/poi/geocode -H 'Content-Type: application/json' -H 'x-wx-source: wx' --data-binary @/tmp/gt_gc.json)" '"coords"'

echo "== B. 静态检查（shared 纯函数） =="
node --input-type=module -e "
import { calcBudget } from './shared/budget.ts';
import { checkupTrip } from './shared/checkup.ts';
import { planDaysSync } from './shared/sync-days.ts';
const b = calcBudget(
  [{ amount: 100, category: '餐', payerMemberId: 'a', splitMode: 'equal', participants: ['a','b'] }],
  [{ id: 'a' }, { id: 'b' }]);
if (b.total !== 100 || b.perMember.find(m => m.memberId === 'b')?.share !== 50) { console.error('calcBudget 数值不对'); process.exit(1); }
const c = checkupTrip(
  [{ id: 'd1', dayNumber: 1, date: '2026-10-01' }],
  [{ id: 'x', dayId: 'd1', time: '10:00', endTime: null, title: 'A' }, { id: 'y', dayId: 'd1', time: '11:20', endTime: null, title: 'B', place: 'P' }]);
if (!c.some(f => f.code === 'tight-transfer')) { console.error('checkup 漏报转场紧张'); process.exit(1); }
const p = planDaysSync([{ id: 'k1', date: '2026-10-02', dayNumber: 1 }], '2026-10-01', '2026-10-03');
if (p.keep.length !== 1 || p.create.length !== 2 || p.deleteIds.length !== 0 || !p.keep[0].dayNumberChanged) { console.error('syncDays 计划不对'); process.exit(1); }
console.log('SMOKE_SHARED_OK');
" 2>&1 | grep -q "SMOKE_SHARED_OK" \
  && check "shared 纯函数（预算/体检/同步）" "SMOKE_SHARED_OK" "SMOKE_SHARED_OK" \
  || check "shared 纯函数（预算/体检/同步）" "failed" "SMOKE_SHARED_OK"

echo
echo "结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
