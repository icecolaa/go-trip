#!/bin/bash
# GoTrip API 冒烟测试：认证、旅程、成员/邀请、行程、预算、清单、日志、AI、分享、天气
# 说明：JSON 请求体一律先写入 UTF-8 临时文件再 --data-binary 上传，规避 Windows 控制台 GBK 编码问题
BASE=http://localhost:8787
PASS=0; FAIL=0
BJ=/tmp/gt_body.json
SUF=$RANDOM

check() {
  local name="$1" actual="$2" expect="$3"
  if echo "$actual" | grep -qE "$expect"; then
    PASS=$((PASS+1)); echo "PASS  $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $name  => $(echo "$actual" | head -c 260)"
  fi
}

jget() { echo "$1" | python -c "import sys,json; d=json.load(sys.stdin); print($2)" 2>/dev/null; }

req() { # method, path, token, [json-body]
  local m="$1" p="$2" t="$3" data="$4"
  local args=(curl -s -X "$m" "$BASE$p" -H "Authorization: Bearer $t")
  if [ -n "$data" ]; then
    printf '%s' "$data" > "$BJ"
    args+=(-H "Content-Type: application/json" --data-binary @"$BJ")
  fi
  "${args[@]}"
}

echo "== 认证 =="
R=$(req POST /api/auth/register "" "{\"username\":\"smoke_a_$SUF\",\"password\":\"smoke123\",\"nickname\":\"冒烟甲\"}")
check "注册用户A" "$R" '"travelId"'
TA=$(jget "$R" "d['token']")
R=$(req POST /api/auth/register "" "{\"username\":\"smoke_b_$SUF\",\"password\":\"smoke123\",\"nickname\":\"冒烟乙\"}")
check "注册用户B" "$R" '"travelId"'
TB=$(jget "$R" "d['token']")
R=$(req POST /api/auth/register "" '{"username":"BAD!","password":"1"}')
check "非法用户名被拒绝" "$R" '用户名需为'
R=$(req POST /api/auth/login "" '{"username":"nobody_xx","password":"wrongpass"}')
check "错误密码被拒绝" "$R" '用户名或密码错误'
R=$(req PATCH /api/me "$TA" '{"nickname":"冒烟甲改","bio":"喜欢爬山"}')
check "更新个人资料(中文)" "$R" '冒烟甲改'
R=$(req GET /api/me "")
check "未登录访问受保护接口" "$R" '请先登录'

echo "== 旅程 =="
R=$(req POST /api/trips "$TA" '{"title":"杭州三日游","destination":"杭州","startDate":"2026-10-01","endDate":"2026-10-03","budget":3000,"coverEmoji":"🏞️","coverColor":"#2f6e4f"}')
check "创建旅程" "$R" '"id"'
TRIP=$(jget "$R" "d['id']")
R=$(req GET /api/trips "$TA")
check "旅程列表含新旅程" "$R" '杭州三日游'
R=$(req GET /api/trips/$TRIP "$TA")
check "旅程详情(3天)" "$R" '"dayNumber":3'
R=$(req GET /api/trips/$TRIP "$TB")
check "非成员访问被拒" "$R" '不是该旅程的成员'
R=$(req PATCH /api/trips/$TRIP "$TA" '{"endDate":"2026-10-04","budget":4000}')
check "延长行程至4天" "$R" '"dayNumber":4'
R=$(req PATCH /api/trips/$TRIP "$TB" '{"title":"hack"}')
check "非成员修改被拒" "$R" '不是该旅程的成员'

echo "== 成员与邀请 =="
R=$(req POST /api/trips/$TRIP/invites "$TA" '{"maxUses":5,"expiresDays":7}')
check "创建邀请" "$R" '"code"'
CODE=$(jget "$R" "d['code']")
R=$(req GET /api/invites/$CODE "")
check "公开查看邀请" "$R" '杭州三日游'
R=$(req POST /api/invites/$CODE/join "$TB" '')
check "用户B通过邀请加入" "$R" '"tripId"'
MB_USER=$(req GET "/api/users/search?q=smoke_b_$SUF" "$TA")
MB_TRAVEL=$(jget "$MB_USER" "d[0]['travelId']")
R=$(req POST /api/trips/$TRIP/members "$TA" "{\"travelId\":$MB_TRAVEL}")
check "重复添加已有成员" "$R" '已经在旅程中'
R=$(req POST /api/trips/$TRIP/members "$TA" '{"travelId":999999}')
check "直接添加不存在的用户" "$R" '没有找到'
R=$(req GET /api/trips/$TRIP/members "$TA")
check "成员列表(2人)" "$R" '冒烟乙'
MEM_B=$(jget "$R" "[m['id'] for m in d if m['displayName']=='冒烟乙'][0]")
MEM_A=$(jget "$R" "[m['id'] for m in d if m['displayName']=='冒烟甲改'][0]")
R=$(req POST /api/trips/$TRIP/members "$TA" '{"displayName":"占位阿姨","avatarColor":"#8a6d3b"}')
check "添加占位成员" "$R" '占位阿姨'
PH_ID=$(jget "$R" "d['id']")
R=$(req PATCH /api/trips/$TRIP/members/$MEM_B "$TA" '{"role":"admin"}')
check "提升B为管理员" "$R" '"role":"admin"'
R=$(req POST /api/trips/$TRIP/location "$TB" '{"lat":30.25,"lng":120.16,"city":"杭州"}')
check "更新成员位置" "$R" '"ok":true'
R=$(req GET "/api/users/search?q=$MB_TRAVEL" "$TA")
check "按旅行ID搜索用户" "$R" "smoke_b_$SUF"
R=$(req PATCH /api/trips/$TRIP/members/$MEM_B "$TA" '{"role":"editor"}')
check "降级B为编辑" "$R" '"role":"editor"'

echo "== 行程与活动 =="
DAYS=$(req GET /api/trips/$TRIP "$TA")
DAY1=$(jget "$DAYS" "[x['id'] for x in d['days'] if x['dayNumber']==1][0]")
DAY2=$(jget "$DAYS" "[x['id'] for x in d['days'] if x['dayNumber']==2][0]")
R=$(req POST /api/days/$DAY1/activities "$TB" '{"title":"西湖断桥","time":"09:00","kind":"sight","place":"断桥残雪","lat":30.259,"lng":120.15,"cost":0}')
check "B添加活动(编辑权限)" "$R" '"id"'
ACT1=$(jget "$R" "d['id']")
R=$(req POST /api/days/$DAY1/activities "$TA" '{"title":"楼外楼午餐","time":"12:00","kind":"food","cost":150}')
check "A添加活动" "$R" '"id"'
ACT2=$(jget "$R" "d['id']")
R=$(req PATCH /api/activities/$ACT1 "$TA" '{"cost":30,"notes":"记得带学生证"}')
check "修改活动" "$R" '"ok":true'
R=$(req POST /api/trips/$TRIP/activities/reorder "$TA" "{\"items\":[{\"id\":$ACT1,\"dayId\":$DAY1,\"sort\":1},{\"id\":$ACT2,\"dayId\":$DAY1,\"sort\":0}]}")
check "活动排序交换" "$R" '"ok":true'
R=$(req POST /api/trips/$TRIP/days "$TA" '{"title":"乌镇一日","date":"2026-10-05"}')
check "追加行程日" "$R" '"id"'
R=$(req POST /api/days/$DAY2/activities "$TB" '{"title":"","kind":"sight"}')
check "空标题活动被拒" "$R" '请填写行程内容'

echo "== 预算 =="
R=$(req POST /api/trips/$TRIP/expenses "$TA" "{\"amount\":150,\"title\":\"楼外楼午餐\",\"category\":\"餐饮\",\"payerMemberId\":$MEM_A,\"date\":\"2026-10-01\"}")
check "记账" "$R" '"id"'
R=$(req POST /api/trips/$TRIP/expenses "$TB" '{"amount":88,"title":"地铁交通","category":"交通"}')
check "B记账" "$R" '"id"'
EXP2=$(jget "$R" "d['id']")
R=$(req PATCH /api/expenses/$EXP2 "$TB" '{"amount":66}')
check "修改账目" "$R" '"ok":true'
R=$(req POST /api/trips/$TRIP/expenses "$TA" '{"amount":-5,"title":"非法"}')
check "非法金额被拒" "$R" '请填写正确的金额'
BUNDLE=$(req GET /api/trips/$TRIP "$TA")
TOTAL=$(jget "$BUNDLE" "d['budget']['total']")
check "预算汇总(216=150+66)" "$TOTAL" '^216$'
SETTLE=$(jget "$BUNDLE" "str(d['budget']['settlements'])[:160]")
echo "      (结算建议: $SETTLE)"

echo "== 打包清单 =="
R=$(req POST /api/trips/$TRIP/packing "$TA" '{"items":[{"title":"充电宝","category":"电子"},{"title":"防晒霜","category":"洗护","quantity":2}]}')
check "批量添加物品" "$R" '"ids":\['
PK1=$(jget "$R" "d['ids'][0]")
R=$(req POST /api/trips/$TRIP/packing/template "$TA" '{"template":"basic"}')
check "导入打包模板" "$R" '"added"'
R=$(req PATCH /api/packing/$PK1 "$TA" '{"done":true}')
check "勾选物品" "$R" '"ok":true'

echo "== 旅行日志与动态 =="
R=$(req POST /api/trips/$TRIP/journal "$TA" "{\"content\":\"西湖的日落太美了！\",\"mood\":\"🥰\",\"dayId\":$DAY1}")
check "发布日志" "$R" '"id"'
J1=$(jget "$R" "d['id']")
R=$(req PATCH /api/journal/$J1 "$TB" '{"content":"改别人的日志"}')
check "他人改日志被拒" "$R" '只能编辑自己的日志'
R=$(req PATCH /api/journal/$J1 "$TA" '{"content":"西湖的日落太美了，明天去灵隐寺。"}')
check "作者改日志" "$R" '"ok":true'
BUNDLE=$(req GET /api/trips/$TRIP "$TA")
check "动态流有记录" "$BUNDLE" '创建了旅程'

echo "== POI / 天气 / AI =="
R=$(req GET "/api/poi/search?q=%E8%A5%BF%E6%B9%96&city=%E6%9D%AD%E5%B7%9E" "$TA")
check "POI搜索返回结果" "$R" 'lat'
R=$(req GET "/api/trips/$TRIP/weather" "$TA")
check "天气查询" "$R" 'date|"error"'
R=$(req GET /api/ai/status "$TA")
check "AI状态接口" "$R" '"enabled"'
R=$(req POST /api/trips/$TRIP/ai/parse-guide "$TA" '{"text":"Day1 西湖一日游 上午 断桥残雪"}')
check "AI解析优雅降级或成功" "$R" 'days|"error"'
R=$(req POST /api/trips/$TRIP/ai/generate "$TA" '{"city":"杭州","days":2}')
check "AI生成优雅降级或成功" "$R" 'days|"error"'

echo "== 分享 =="
R=$(req POST /api/trips/$TRIP/share "$TA" '{"enable":true}')
check "开启分享链接" "$R" '"shareToken"'
TOKEN=$(jget "$R" "d['shareToken']")
R=$(req GET /api/share/$TOKEN "")
check "公开访问分享页" "$R" '杭州三日游'
R=$(req POST /api/trips/$TRIP/share "$TA" '{"enable":false}')
check "关闭分享" "$R" 'null'
R=$(req GET /api/share/$TOKEN "")
check "关闭后分享失效" "$R" '不存在或已关闭'

echo "== 越权与清理 =="
R=$(req DELETE /api/trips/$TRIP/members/$MEM_A "$TB")
check "B(编辑)移除成员被拒" "$R" '权限不足'
R=$(req DELETE /api/trips/$TRIP/members/$PH_ID "$TA")
check "A移除占位成员" "$R" '"ok":true'
R=$(req DELETE /api/trips/$TRIP "$TB")
check "非发起人删行程被拒" "$R" '权限不足'
R=$(req DELETE /api/trips/$TRIP/members/$MEM_B "$TA")
check "A移除成员B" "$R" '"ok":true'
R=$(req POST /api/trips/$TRIP/transfer "$TA" "{\"memberId\":$MEM_B}")
check "转让给非成员被拒" "$R" '不存在'
R=$(req DELETE /api/trips/$TRIP "$TA")
check "发起人删除旅程" "$R" '"ok":true'
R=$(req POST /api/auth/logout "$TB" '')
check "登出B" "$R" '"ok":true'
R=$(req GET /api/me "$TB")
check "登出后token失效" "$R" '请先登录'

echo ""
echo "结果: PASS=$PASS FAIL=$FAIL"
