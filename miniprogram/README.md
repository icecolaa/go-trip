# GoTrip 微信小程序（Taro 3 + React 18）

复用 `server/` 的 REST API 与 `shared/` 类型；与 `client/`（Web 版）并行，互不影响。

## 前置条件

1. **小程序 AppID**：在 [微信公众平台](https://mp.weixin.qq.com/) 注册，把 AppID 填入 `project.config.json` 的 `appid`（当前为占位 `touristappid`，仅支持开发者工具本地预览）。
2. **合法域名 / 备案（上线硬门槛）**：正式版要求 request/socket 合法域名为**已备案的 HTTPS 域名**。`gotrip.pocketbay.app` 未备案时：
   - 开发与体验版：在开发者工具「详情 → 本地设置」勾选「不校验合法域名…」即可联调；
   - 正式上线：用自有已备案域名反向代理到 GoTrip 服务，或评估微信云托管；并同步修改 `src/config.ts` 的生产地址。
3. **本地服务**：仓库根目录 `npm run dev`（:8787），并在开发者工具中开启「不校验合法域名」。

## 开发

```bash
cd miniprogram
npm install
npm run dev:weapp     # 监听构建，产物在 dist/
# 用微信开发者工具「导入项目」选择 miniprogram/ 目录（miniprogramRoot 为 dist/）
```

类型检查：`npm run check`

## 结构

- `src/api/request.ts` — Taro.request 封装：Bearer 会话、错误归一化（ApiFail）、401 自动清会话
- `src/api/ws.ts` — WebSocket 封装：`/ws?token=`、订阅房间、15s 心跳（对应服务端 ws.ts）
- `src/config.ts` — API_BASE / WS_BASE（开发指向 localhost:8787，生产指向线上域名）
- `src/types.ts` — 复用 `shared/types.ts`（@shared/* 别名）+ TripCardInfo 等客户端类型
- `src/pages/login` / `src/pages/trips` — 登录与旅程列表（验证全链路的脚手架页面）

## 与 server 的兼容性

后端零改动：REST + Bearer、`/ws?token=` 查询参数鉴权、dataURL 图片提交均可由小程序等价调用。

## 上传 / 预览（miniprogram-ci）

免开发者工具，命令行直接上传代码或生成预览二维码：

```bash
npm run preview               # 生成 preview-qr.jpg，微信扫码打开体验版预览
npm run upload -- 1.0.0       # 上传为开发版本（版本管理里可见）
npm run upload -- 1.0.0 "修复预算页"
```

前置条件：

1. 上传密钥 `private.<appid>.key` 放在本目录（已被 .gitignore 忽略，绝不提交）；
2. 公众平台「开发设置 → IP 白名单」需包含当前机器出口 IP（动态 IP 建议关闭白名单或定期更新）。

> 密钥/Secret 若曾离开本机，及时在公众平台重置。
