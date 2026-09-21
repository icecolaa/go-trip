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
#   WXCLI_APPID    小程序 appId（wxcloud login 用）
#   WXCLI_KEY      小程序上传密钥文件路径（wxcloud login 用，private.*.key）
#   TCB_ENV_ID     云托管环境 ID，默认 prod-9g9b12cyd5f63833
#   TCB_SERVICE    服务名，默认 gotrip
#   TCB_PORT       容器监听端口，默认 8787
#   CCR_NAMESPACE 腾讯云容器镜像仓库命名空间（docker push 用）
#   CCR_IMAGE     镜像地址（不含 tag），如 ccr.ccs.tencentyun.com/xxx/gotrip
#   DOCKER_USER / DOCKER_PASSWORD   镜像仓库账号
#
# 未设置 CCR_* 时退化为 --dry-run，只打印将执行的命令。
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

ENV_ID="${TCB_ENV_ID:-prod-9g9b12cyd5f63833}"
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
if [ ${#MISSING[@]} -gt 0 ] || [ -z "$IMAGE" ] || [ -z "$NS" ]; then
  echo ""
  echo "  ⚠️  未配置完整部署密钥（${MISSING[*]:-} / CCR_IMAGE / CCR_NAMESPACE）"
  echo "     进入 dry-run：只打印将执行的命令，不真正部署。"
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

# ---------- 构建并推送镜像 ----------
FULL_IMAGE="${IMAGE}:${VERSION}"
if [ -z "$IMAGE" ]; then
  log "构建镜像（未配 CCR_IMAGE，仅本地构建不推送）"
  RUN_BUILD=(docker build -t "gotrip:${VERSION}" .)
  FULL_IMAGE="gotrip:${VERSION}"
else
  log "构建并推送镜像到腾讯云 CCR"
  RUN_BUILD=(docker build -t "$FULL_IMAGE" .)
fi

# ---------- 部署命令 ----------
DEPLOY_CMD=(wxcloud run:deploy
  --envId="$ENV_ID"
  --serviceName="$SERVICE"
  --containerPort="$PORT"
  --libraryImage="$FULL_IMAGE"
  --remark "$REMARK"
  --releaseType FULL
  --detach
  --noConfirm)

echo ""
echo "  将执行："
echo "    ${RUN_BUILD[*]}"
if [ -n "$IMAGE" ] && [ -n "${DOCKER_USER:-}" ]; then
  echo "    docker login ccr.ccs.tencentyun.com -u \$DOCKER_USER"
  echo "    docker push $FULL_IMAGE"
fi
echo "    ${DEPLOY_CMD[*]}"
echo ""

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run 结束，未做任何变更"
  exit 0
fi

log "构建镜像"
"${RUN_BUILD[@]}"

if [ -n "$IMAGE" ] && [ -n "${DOCKER_USER:-}" ]; then
  log "推送镜像"
  echo "$DOCKER_PASSWORD" | docker login ccr.ccs.tencentyun.com -u "$DOCKER_USER" --password-stdin
  docker push "$FULL_IMAGE"
fi

log "登录云托管 CLI"
wxcloud login --appId "$WXCLI_APPID" --privateKey "$WXCLI_KEY"

log "发布版本（$SERVICE @ $ENV_ID）"
"${DEPLOY_CMD[@]}"

log "已提交发布。等 2-3 分钟后验证："
cat <<EOF

  curl -sS https://${SERVICE}-1509709-1308923163.ap-shanghai.run.tcloudbase.com/health

  预期 {"ok":true}；再到控制台「服务日志」确认出现
  「➜ 数据库：MySQL（微信云托管内置）」——没有这行说明没连上 MySQL，
  检查版本的环境变量里是否有 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD。

  版本状态探针（不依赖控制台显示，判断线上到底跑没跑上新代码）：
    1) 长昵称注册应返回 500（MySQL 严格模式）而不是 200（SQLite）
    2) POST /api/auth/wechat 返回 400「缺少微信身份」= feat 代码在线
    3) 旧库探针账号登录返回 401 = 已切到新库
EOF
