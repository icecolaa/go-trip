#!/usr/bin/env bash
# ============================================================
# GoTrip → 腾讯云托管（CloudBase 云托管）CLI 部署脚本
#
# 用途：不依赖控制台「代码仓库部署」流水线，直接在本地/CI 里构建镜像并发布版本。
#       根治「仓库部署显示完成但线上没切换」的问题（根因是流水线分支选错，
#       MySQL 方言与幂等迁移只在 feat/miniprogram 分支，master 没有）。
#
# 用法：
#   bash scripts/deploy-tcb.sh [--dry-run] [--remark "本次说明"]
#
# 依赖（密钥一律从环境变量读，绝不写进本文件、绝不提交）：
#   WXCLI_APPID    小程序 appId（wxcloud login 用）——必填
#   WXCLI_KEY      小程序上传密钥文件路径（wxcloud login 用，private.*.key）——必填
#   TCB_ENV_ID     云托管环境 ID，默认 gotrip-d1gb187o991f5260a（微信小程序云开发入口创建的 gotrip 环境）
#   TCB_SERVICE    服务名，默认 gotrip
#   TCB_PORT       容器监听端口，默认 8787
#   TCB_ENV_PARAMS 版本环境变量，格式 xx=a&yy=b；缺省用内置的 TZ + 业务 6 项
#                  （MYSQL_* 不设默认值，需你确认后自行追加，避免把库密码带进命令历史）
#
# 可选：预先构建好镜像再发布（CI 场景）。设置了下面三个变量才走镜像模式，
#       否则走 CLI 原生源码构建（更简单，只需上面两个密钥）：
#   CCR_IMAGE      镜像地址（不含 tag），如 ccr.ccs.tencentyun.com/<ns>/gotrip
#   DOCKER_USER / DOCKER_PASSWORD   镜像仓库账号
#
# 未设置 WXCLI_APPID / WXCLI_KEY 时退化为 --dry-run，只打印将执行的命令。
# ============================================================
set -euo pipefail

DRY_RUN=0
REMARK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --remark) REMARK="${2:-}"; shift 2 ;;
    --remark=*) REMARK="${1#--remark=}"; shift ;;
    *) die "未知参数：$1（可用 --dry-run / --remark \"说明\"）" ;;
  esac
done

ENV_ID="${TCB_ENV_ID:-gotrip-d1gb187o991f5260a}"
SERVICE="${TCB_SERVICE:-gotrip}"
PORT="${TCB_PORT:-8787}"
IMAGE="${CCR_IMAGE:-}"
NS="${CCR_NAMESPACE:-}"
VERSION="$(date +%Y%m%d-%H%M%S)"
[ -n "$REMARK" ] || REMARK="CLI 部署 $VERSION"

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- 前置检查 ----------
log "检查部署前置条件"
command -v npm >/dev/null || die "未找到 npm"
[ -f Dockerfile ] || die "必须在仓库根目录执行（找不到 Dockerfile）"
[ -f package-lock.json ] || die "找不到 package-lock.json，Dockerfile 需要 npm ci"

# 分支必须是 feat/miniprogram：master 缺 MySQL 方言，构建出来的版本不认 MYSQL_* 环境变量
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "feat/miniprogram" ]; then
  die "当前分支是 $BRANCH。MySQL 方言与幂等迁移只在 feat/miniprogram，切过去再部署：git checkout feat/miniprogram"
fi
echo "  分支：$BRANCH ✓"
echo "  提交：$(git rev-parse --short HEAD) ✓"

# 密钥只从环境变量取；缺密钥时不允许真的部署
MISSING=()
[ -n "${WXCLI_APPID:-}" ] || MISSING+=("WXCLI_APPID")
[ -n "${WXCLI_KEY:-}" ] || MISSING+=("WXCLI_KEY")
if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "  ⚠️  未配置部署密钥（${MISSING[*]}）"
  echo "     进入 dry-run：只打印将执行的命令，不真正部署。"
  echo "     源码部署只需要这两个："
  echo "       export WXCLI_APPID=\"wx................\""
  echo "       export WXCLI_KEY=\"\$HOME/private.wxea1150ef589e225f.key\""
  DRY_RUN=1
fi

# ---------- 本地自检：类型 + 冒烟 ----------
log "本地自检（tsc + 冒烟）"
npm run check || die "类型检查未通过，终止部署"

SMOKE_OUT=""
if curl -s -m 3 http://localhost:8787/health >/dev/null 2>&1; then
  # 注意：不能写成 `smoke.sh | tail`——管道退出码取自 tail，冒烟失败也会被吞掉
  if ! SMOKE_OUT="$(bash scripts/smoke.sh 2>&1)"; then
    printf '%s\n' "$SMOKE_OUT" | grep -E "^FAIL|结果" || true
    die "冒烟未全部通过，终止部署（先修好再发）"
  fi
  printf '%s\n' "$SMOKE_OUT" | grep -E "^FAIL|结果" || true
else
  echo "  本地服务未运行，跳过冒烟（部署前建议先 npm run dev 跑一遍）"
fi

# ---------- 组装部署命令 ----------
# ⚠️ 环境变量处理：默认【不传】--envParams，让新版本继承服务设置里已有的配置
# （MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD 和业务 6 项都在那里）。
# 因为 --envParams 是「同步到服务设置」——只传一部分会把没传的那些覆盖掉，
# 丢了 MYSQL_* 容器就回退 SQLite（数据不持久），这是本项目反复栽过的坑。
# 仅在「服务设置里确实缺变量」时，才用 TCB_ENV_PARAMS 传全量。
ENV_PARAMS="${TCB_ENV_PARAMS:-}"

if [ -n "$IMAGE" ]; then
  # 镜像模式：CI 里先 build+push，再按 tag 发布
  FULL_IMAGE="${IMAGE}:${VERSION}"
  RUN_BUILD=(docker build -t "$FULL_IMAGE" .)
  DEPLOY_CMD=(wxcloud run:deploy .
    --envId="$ENV_ID"
    --serviceName="$SERVICE"
    --containerPort="$PORT"
    --libraryImage="$FULL_IMAGE"
    --dockerfile=Dockerfile
    --remark "$REMARK"
    --releaseType FULL
    --detach
    --noConfirm)
else
  # 源码模式（默认）：CLI 自己按 Dockerfile 构建并发布，只需 appId + 私钥两个密钥
  FULL_IMAGE="（由 CLI 按 Dockerfile 构建）"
  RUN_BUILD=()
  DEPLOY_CMD=(wxcloud run:deploy .
    --envId="$ENV_ID"
    --serviceName="$SERVICE"
    --containerPort="$PORT"
    --dockerfile=Dockerfile
    --remark "$REMARK"
    --releaseType FULL
    --detach
    --noConfirm)
fi

if [ -n "$ENV_PARAMS" ]; then
  DEPLOY_CMD+=(--envParams="$ENV_PARAMS")
fi

echo ""
echo "  将执行："
if [ ${#RUN_BUILD[@]} -gt 0 ]; then
  echo "    ${RUN_BUILD[*]}"
  if [ -n "${DOCKER_USER:-}" ]; then
    echo "    docker login ccr.ccs.tencentyun.com -u \$DOCKER_USER"
    echo "    docker push $FULL_IMAGE"
  fi
fi
echo "    wxcloud login --appId \$WXCLI_APPID --privateKey \$WXCLI_KEY"
echo "    ${DEPLOY_CMD[*]}"
echo ""
if [ -n "$ENV_PARAMS" ]; then
  echo "  环境变量（--envParams，会同步到服务设置）：$ENV_PARAMS"
else
  echo "  环境变量：不传 --envParams，新版本继承服务设置里已有的配置"
  echo "            （MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD 与业务 6 项）"
  echo "  ⚠️  若服务设置里缺 MYSQL_*，容器会回退 SQLite（数据不持久）。"
  echo "     确认缺的话，用 TCB_ENV_PARAMS 传【全量】再部署，例如："
  echo "       TCB_ENV_PARAMS='TZ=Asia/Shanghai&MYSQL_ADDRESS=...&MYSQL_USERNAME=...&MYSQL_PASSWORD=...' bash scripts/deploy-tcb.sh"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run 结束，未做任何变更"
  exit 0
fi

if [ ${#RUN_BUILD[@]} -gt 0 ]; then
  log "构建镜像"
  "${RUN_BUILD[@]}"

  if [ -n "$IMAGE" ] && [ -n "${DOCKER_USER:-}" ]; then
    log "推送镜像"
    echo "$DOCKER_PASSWORD" | docker login ccr.ccs.tencentyun.com -u "$DOCKER_USER" --password-stdin
    docker push "$FULL_IMAGE"
  fi
fi

log "登录云托管 CLI"
wxcloud login --appId "$WXCLI_APPID" --privateKey "$WXCLI_KEY"

log "发布版本（$SERVICE @ $ENV_ID）"
"${DEPLOY_CMD[@]}"

log "已提交发布。等 2-3 分钟后验证："
cat <<EOF

  curl -sS https://gotrip-gotrip-d1gb187o991f5260a-1308923163.ap-shanghai.run.wxcloudrun.com/health

  预期 {"ok":true}；再到控制台「服务日志」确认出现
  「➜ 数据库：MySQL（微信云托管内置）」——没有这行说明没连上 MySQL，
  检查版本的环境变量里是否有 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD。

  版本状态探针（不依赖控制台显示，判断线上到底跑没跑上新代码）：
    1) 长昵称注册应返回 500（MySQL 严格模式）而不是 200（SQLite）
    2) POST /api/auth/wechat 返回 400「缺少微信身份」= feat 代码在线
    3) 旧库探针账号登录返回 401 = 已切到新库
EOF
