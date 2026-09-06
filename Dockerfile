# ---- 构建阶段：安装依赖并构建前端 ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run build && npm prune --omit=dev

# ---- 运行阶段：仅保留生产依赖与构建产物 ----
# server 运行 TS 源码依赖 Node 的类型剥离（需 node >= 22.6，推荐 24+），
# 数据库使用内置 node:sqlite，运行时第三方依赖仅 ws
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY shared/ shared/
COPY server/ server/
COPY --from=build /app/client/dist client/dist

ENV GOTRIP_PORT=8787 \
    GOTRIP_DB=/app/server/data/gotrip.db
VOLUME /app/server/data
EXPOSE 8787

# PocketBay 配置迁移会把批准的 .env 只读挂载到 /app/.env，启动时自动加载
CMD ["node", "--no-warnings", "--env-file-if-exists=.env", "server/src/index.ts"]
