# Pony Roulette V3

MLP 图片发现站：选择角色、内容等级和模式，转动 Pony Gacha，在轻量的扭蛋演出中发现、收藏并整理作品。

V3 在现有 V2 项目上增量开发，保留扭蛋机、收藏、历史、Collection、角色筛选、稀有度、分享、PWA 与同源图片代理。生产环境使用 **Cloudflare Worker + Static Assets + Cache API**，不要求 R2、数据库或付费后端。

当前部署：[pony-roulette.huayunkanghua.workers.dev](https://pony-roulette.huayunkanghua.workers.dev)

## 架构

```text
Browser ── /api/random ── Pony Roulette content policy
                              │
                              ▼ sequential failover
                         Derpibooru
                              │ failure
                         Trixiebooru
                              │ failure
                          Twibooru

Browser ── /api/image/:provider/:id ── Worker ── provider CDN
```

一次抽取只访问当前优先级最高的可用 Provider。Derpibooru 正常时不会请求两个备用源。超时、网络错误、429、5xx 或 Trixiebooru 的网页挑战可进入下一源；参数与权限错误不会被伪装成网络故障。

浏览器收到的图片地址始终是本站 `/api/image/:provider/:id`。Provider CDN URL 只在 Worker 内使用，并受 HTTPS 域名白名单、无重定向、文件类型、文件签名和 8 MB 大小上限保护。作品来源页面只在用户主动点击时打开。

## 独立内容分级

前端只发送枚举值，不能提交任意搜索表达式。Worker 为每个 Provider 构造查询，并在 Provider 返回后再次读取标签、标准化、逐张校验。

| 维度            | 选项                | 行为                                                  |
| --------------- | ------------------- | ----------------------------------------------------- |
| Sexual Content  | Safe                | 只接受 `safe`                                         |
| Sexual Content  | 13+                 | 只接受 `suggestive`                                   |
| Sexual Content  | 18+ / All           | 只接受 `questionable` 或 `explicit`                   |
| Sexual Content  | 18+ / Questionable  | 只接受 `questionable`                                 |
| Sexual Content  | 18+ / Explicit Only | 只接受 `explicit`                                     |
| Graphic Content | Clean               | 排除 `semi-grimdark`、`grimdark`、`gore`、`grotesque` |
| Graphic Content | Dark                | 允许暗黑主题，排除 `gore`、`grotesque`                |
| Graphic Content | Graphic             | 允许上述图形内容标签，不改变 Sexual Content           |

缺少唯一 Rating、同时出现多个 Rating，或无法确认的内容一律拒绝。首次进入 18+ 必须在界面确认；确认状态和选择保存在 localStorage。成人缩略图默认模糊。

Derpibooru Filter 仍作为高级偏好存在，公开系统列表由 `/api/filters` 动态获取并缓存六小时。Filter ID 必须存在于服务端允许列表；它不能放宽 Pony Roulette 自身的 Sexual / Graphic 内容规则。Twibooru 使用站内 Everything Filter ID 2，再由 Pony Roulette 查询和二次校验控制内容，绝不转发 Derpibooru Filter ID。

## API

- `GET /api/random?character=fluttershy&mode=random&content=safe&adultMode=all&graphic=clean&filter=100073`
- `GET /api/metadata/:provider/:id`：按同一内容规则恢复收藏、历史或分享结果。
- `GET /api/image/:provider/:id`：校验元数据后代理图片；支持 `size=preview|saver|original`。
- `GET /api/filters`：动态 Derpibooru System/Public Filters，缓存失败时使用最近快照或安全 ID 0。
- `GET /api/health`：返回最近真实请求记录的 Provider 状态、活动 Provider 和媒体缓存方式，不为健康检查额外请求三个图库。

允许的 Provider 为 `derpibooru`、`trixiebooru`、`twibooru`。旧 `/api/image/123` 与 `/api/metadata/123` 路径继续按 Derpibooru 解释。

## 本地运行

需要 Node.js 22 或更高版本：

```bash
npm install
npm run build
npm test
npm run dev:all
```

打开 Vite 输出的地址，默认 `http://localhost:5173`。也可以运行 `npm start`，直接预览构建后的 Worker 与静态资源。

如果本机访问图库必须经过 HTTP 代理，可用：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7897'
npm run build
npm run dev:proxy
```

代理预览位于 `http://127.0.0.1:8788`。本机代理不会写入线上配置。

## 验证

```bash
npm run build
npm test
npm run check:worker
npm run verify:live
```

自动化测试覆盖内容组合、Unknown 拒绝、三源严格串行、Derpibooru 成功时不访问备用源、Trixiebooru 回退、Twibooru 回退、跨站 canonical ID、无 R2 图片代理、SSRF、防任意查询、错误状态和被动健康检查。

浏览器验收时，在 DevTools Network 中确认自动加载只有当前站点；只有主动点击 Provider Page 才应离开本站。

## Cloudflare 部署

```bash
npm run deploy
```

`wrangler.toml` 已声明 Worker、Static Assets、三个 Rate Limit binding 和非秘密配置。默认不绑定 R2；热点图片和 Filter 目录使用 Cloudflare Cache API。若以后主动添加私有 `PONY_IMAGES` binding，代码仍兼容 R2 持久缓存，但这不是运行要求。

可选的 `DERPIBOORU_API_KEY` 必须使用 Worker Secret，不能写入仓库或 `VITE_*`。当前公开搜索不要求 API Key。

## 数据与限制

- Collection 元数据使用 IndexedDB；设置、收藏和最近 50 条历史继续使用 localStorage。图片二进制不写入 IndexedDB。
- Twibooru 只在前两个源失败后访问，以减少其搜索 API 限额消耗；读取 `X-RL`、`X-RL-Remaining`、`X-RL-Reset`，缺失响应头不会被误判为零额度。
- Trixiebooru 共用经过验证的 Philomena 响应解析器，但若其 Cloudflare 挑战拦截 Worker，会立即标为暂不可用并转向 Twibooru。
- PicPony 不参与自动请求；当前没有验证出稳定的按 Derpibooru ID 页面映射，因此没有添加可能失效的入口。
- Cache API 是边缘热点缓存，可能被驱逐；不启用 R2 时，冷门收藏在离线状态只能显示浏览器已缓存的资源。
- 大陆访问稳定性取决于部署域名与网络环境；同源代理避免浏览器主动连接图库域名，但不等于专线服务。

旧版实现说明保留在 [docs/V2.md](docs/V2.md)，V3 的实际 Provider 与测试说明见 [docs/V3.md](docs/V3.md)。
