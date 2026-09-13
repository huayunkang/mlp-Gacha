# Pony Roulette V2

**推荐部署：Cloudflare Workers + Static Assets + R2。** 适合个人项目，无需 VPS，可以从免费额度起步。现有 React / Vite 界面完整保留，生产 API 已迁移至 Worker；`server-node/` 保留为 V1 Express 备用参考，完整 V2 请使用 Worker。

Every roll, a new pony. 转动一点魔法，收藏一次心动。

完整 V2 功能、原生 Filter 实测列表、稀有度公式和验收边界见 [V2 说明](docs/V2.md)。以下保留原有架构及部署教程。

## 架构与网络

```text
GitHub → Cloudflare Workers Builds → 一个 Worker、一个域名
                                      ├─ /                React 静态资源
Browser → 本站 /api/random             └─ Worker → Derpibooru API
Browser → 本站 /api/image/:id → Cache API → 私有 R2 → Derpibooru API / CDN
```

浏览器不会直接连接 Derpibooru。主图、模糊背景、缩略图、收藏、历史和预加载全部使用本站 `/api/image/:id`。唯一外部地址是用户主动点击的来源链接，不会自动打开、预连接或嵌入。生产 CSP 限制图片和请求为同源。R2 不需要启用公共访问，也不要绑定 `r2.dev` 给前端。

选择 Workers Static Assets，可在一个部署内托管 Vite 产物和 API，不需要两个域名或 CORS。无需 Pages 项目；最终地址通常是 `https://pony-roulette.<你的子域名>.workers.dev`，不需要购买域名。

## 本地启动（Windows / macOS / Linux）

安装 Node.js 22 或更高版本（安装程序应同时安装 npm），在项目根目录运行：

```bash
npm install
npm run build
npm run dev:all
```

打开终端显示的 Vite 地址，默认 `http://localhost:5173`。Vite 将 `/api` 转发至本地 Worker `http://127.0.0.1:8787`。首次先 build 为 Wrangler 创建静态资源目录；后续前端修改自动热更新。

也可以打开两个终端分别运行：

```bash
npm run dev
npm run dev:worker
```

仅预览生产产物：`npm run build` 后 `npm start`，打开 `http://localhost:8787`。

本地默认使用 Wrangler 模拟 R2，数据保存在 `.wrangler/state/`，不需要 Cloudflare 登录或真实 R2，不产生远程 R2 费用。它与线上 bucket 完全独立，本地图片不会随部署上传。不要给开发绑定添加 `remote = true`，除非明确需要操作真实 bucket。

若本机无法访问 Derpibooru，可使用自己已配置的 HTTP 代理。Wrangler CLI 代理与本地 workerd 出站代理支持可能不同。项目提供可选 `npm run dev:proxy`：仍运行同一份 Worker 和本地 R2，仅将本地上游网络通过 Node HTTP 代理转发，监听 `http://127.0.0.1:8788`。PowerShell 先设置 `$env:HTTPS_PROXY='http://127.0.0.1:你的代理端口'`，再运行该命令。此模式缓存位于 `.wrangler/proxy-state/r2`，代码修改后需重启并重新 build；不是线上部署方案。不要把本机代理写入线上配置。线上 Worker 使用 Cloudflare 自身出站网络。

## 新手部署步骤

1. 注册并登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。Workers 保持 Free 计划即可。
2. 进入 **Storage & databases → R2 → Overview**，按界面开通 R2。R2 有免费用量，但开通需要完成订阅流程，可能要求付款方式；超过免费额度会计费。
3. 创建 **Standard** 类型 bucket，名称为 `pony-images`。保持私有，关闭 Public Development URL。不要选择 Infrequent Access。
4. 在 bucket **Settings → Object lifecycle rules** 添加规则：前缀 `images/`，对象上传 **30 天后删除**。这是最简单的自动空间回收，无需 Cron、数据库或逐图写入访问时间。
5. 本地运行 `npm install`，再运行 `npx wrangler login`，在浏览器授权自己的 Cloudflare 账户。
6. 检查 `wrangler.toml` 中 `PONY_IMAGES` 的 `bucket_name` 与创建的名称一致。三个限流 `namespace_id` 要在账户内独立；如果其他项目已使用 1001～1003，换成未使用的正整数。
7. 运行 `npm run build`、`npm test`、`npm run check:worker`，然后 `npm run dev:worker` 本地测试。
8. 运行 `npx wrangler deploy`（或 `npm run deploy` 自动先构建）。Wrangler 输出实际 `*.workers.dev` 地址。
9. 打开该地址和 `/api/health`。应返回 `status: ok`、`derpibooru: reachable`、`r2: ok`。网络检测结果在边缘复用 60 秒。
10. 打开 DevTools → Network，点“再来一张”、收藏、最近看过。确认只有本站请求；图片响应 `X-Cache` 应经历 `MISS` → `EDGE-HIT` 或 `R2-HIT`。

**本项目没有替你创建远程 bucket、登录账户或发布线上站点。** 上述步骤可在自己的账户执行。默认不需要任何 Secret，也不需要 Derpibooru API Key。以后确实需要 Key 时，使用 `npx wrangler secret put DERPIBOORU_API_KEY`。勿写入 GitHub、`VITE_*` 或公共配置。

### 方法 A：GitHub 自动部署

将当前项目推送到自己的 GitHub 仓库，包含 `package-lock.json`。进入 **Workers & Pages → Create application → Import a repository / Connect to Git → GitHub**，授权并选择仓库，创建 **Worker**（不是仅托管静态文件的 Pages 项目）。界面名称可能随更新略有变化。

- 项目根目录：仓库根目录。
- 构建命令：`npm run build`。
- 部署命令：`npx wrangler deploy`。
- Worker 名称：`pony-roulette`，与配置保持一致。
- Node 版本：22 或更新。
- 提前创建 `pony-images`，R2 绑定由 `wrangler.toml` 声明。

以后向已连接的生产分支推送即可自动构建部署。仓库附带 `.github/workflows/ci.yml` 验证构建和测试，它本身不部署，也不需要 Cloudflare Secret。不要再配置重复的 GitHub Actions 部署。参考 [Workers Builds GitHub 集成](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)。

### 方法 B：Wrangler 手动部署

```bash
npx wrangler login
# 若已经在控制台创建过 bucket，跳过下一行
npx wrangler r2 bucket create pony-images
npm run deploy
```

自定义域名属于后续可选项，在 Worker Settings → Domains & Routes 添加；无需为启动项目购买域名。

## 环境变量

生产非秘密配置在 `wrangler.toml`。本地可复制 `.dev.vars.example` 为 `.dev.vars` 覆盖；该文件已忽略。`.env.example` 仅供旧 Node 环境使用。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| DERPIBOORU_BASE_URL | https://derpibooru.org | 安全起见仅允许官方 origin，不作为任意代理 |
| REQUEST_TIMEOUT_MS | 10000 | 单次上游请求超时，包含下载 body |
| REQUEST_RETRIES | 2 | 最多重试两次，等待 500ms、1500ms |
| MAX_IMAGE_SIZE_MB | 8 | Worker 每张图片最大下载量，可设置 1～16 |
| CACHE_TTL_DAYS | 30 | R2 对象读取有效期；同时配置 bucket 生命周期才会主动删除无人访问的旧对象 |
| EDGE_CACHE_SECONDS | 3600 | 图片边缘缓存时长，设为 0 可测试纯 R2 命中 |
| DERPIBOORU_API_KEY | 无 | 可选 Worker Secret，前端不可见 |

## API 与安全策略

`GET /api/random?character=fluttershy&mode=top`：角色可取 `shared/types.ts` 中白名单键，模式为 `random`、`top`、`featured`。缺省 `all`、`random`。可选 `exclude=<上一张正整数 ID>` 从候选中排除上一张；前端自动携带，候选不足时返回可重试错误。额外参数、重复参数、非法角色和模式返回 400。响应包含本站 image / preview、ID、尺寸、标签、画师、分数和来源链接；不包含 CDN 地址。响应 `Cache-Control: no-store`。

`GET /api/image/:id[?size=preview]`：只接受正整数 ID，不接受 URL。即使直接猜 ID，也先检查 safe 标签与禁止标签，再下载图片。上游地址必须为 HTTPS 且属于受信任 Derpibooru/CDN 域名，禁止跟随重定向、凭据和非标准端口。下载检查 MIME、文件签名和累计字节数，支持 JPEG/JPG、PNG、WebP、GIF；拒绝 SVG、HTML、视频及超大文件。主图采用 `large`（没有时使用 full）节省流量，保持内容完整、不裁剪；分辨率信息是原始图片尺寸。

`GET /api/health`：检查 API 和 R2。上游失败返回 `degraded`，不会阻止页面或已有有效缓存加载。

所有搜索包含 `safe` 并排除 explicit、questionable、suggestive、grimdark、semi-grimdark、grotesque、seizure warning、gore、nudity，以及实测发现需要排除的 fetish、fetish fuel、bondage、vore、foalcon、rape、sexual assault，再限定四类图片 MIME。查询结果再次检查标签，图片 ID 接口同样检查。完整名单位于 `shared/policy.ts`。safe 是上游社区标签保证，无法替代人工审核；上游标签变化在缓存有效期内可能尚未反映，需要紧急下架时删除 R2 对象并清除 CDN 缓存。策略升级可修改 `POLICY_VERSION` 使服务器旧缓存失效；已在浏览器缓存的对象最长可能保留 1 天。

生产采用 Cloudflare Rate Limiting binding：随机每 IP 60 次/分钟，图片 240 次/分钟，health 12 次/分钟。计数是 Cloudflare 数据中心范围的近似限制，不是全球强一致配额，也不是费用硬上限；共享公网 IP 的用户会共享限额。跨站浏览器图片请求被拒绝，不开放 `Access-Control-Allow-Origin: *`。

## Derpibooru 实测

2026-09-12 已实际调用官方 `/api/v1/json/search/images` 验证：

| 功能 | 查询参数 | 结果 |
| --- | --- | --- |
| 随机 | sf=random, per_page=1 | 成功，图片 2825381 |
| Fluttershy | fluttershy + 安全查询 | 成功，图片 1091030 |
| 高分 | score.gt:100 + 安全查询 | 成功，图片 2869300，152 分 |
| Featured | featured image + 安全查询 | 成功，图片 1524912 |

搜索响应为 `{ total, images }`，单图接口为 `{ image }`，`tags` 为数组。`mime_type:image/...` 查询已随上述四项实际验证。生产 Worker 每次取 3 个轻量候选并随机选择一个，`per_page=1` 也已验证；没有长期内存池、KV、D1 或 Durable Objects，不依赖 isolate 生命周期。前端仅提前取下一张，不批量下载高清图。

本机最初直连超时，使用系统已有代理后以上四项成功；这不等于已验证线上 Cloudflare → Derpibooru 路径。部署后必须实际检查。运行 `npm run verify:live` 可复测并输出 `test-results/live-api.json`（不提交临时数据）。该脚本支持 `HTTPS_PROXY`。官方参考：[API](https://derpibooru.org/pages/api)。

## 缓存与费用控制

R2 key：`images/safe-v2/<id>/full` 或 `/preview`，无需扩展名，MIME 存在对象 HTTP metadata。保存内容类型、HTTP 缓存头、R2 ETag、图片 ID、策略版本和缓存时间。R2 miss 时才下载；不存在批量启动预热。

命中时无需访问 Derpibooru；离线仍可浏览有效缓存。过期缓存重新检查元数据，若上游不可访问则报错，不跳过安全验证。Cache API 为数据中心局部热点缓存，可随时被驱逐；R2 是持久化层。浏览器缓存 1 天，支持 ETag / If-None-Match / 304。首次创建缓存会有一次写入和额外读取。跨 isolate 并发 miss 可能重复下载并写入同一 key；不使用额外收费协调服务。

**30 天生命周期按创建时间删除，不是“最后访问时间”，也不能保证空间永远低于 10GB。** 初版不做全桶扫描和 LRU，因为扫描增加 R2 操作。请在 Dashboard 监控用量，视访问量缩短生命周期或降低单图上限。需要更严格预算时可另增全局准入计数；当前没有自动停费开关。

2026-09-12 核对官方额度：Workers Free 每日 100,000 动态请求、每次 10ms CPU；纯静态资源请求免费。R2 Standard 每月包含 10 GB-month 存储、100 万 Class A、1,000 万 Class B 操作，互联网出站流量免费。免费量是账户共享，R2 超额会计费，不能承诺任何访问量下永远 0 元。网络等待不计入 CPU，但处理大型图片可能触及 CPU / 内存限制，因此默认限制 8MB，不在 Worker 转码。R2 必须先开通订阅。参考：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[R2 定价](https://developers.cloudflare.com/r2/pricing/)、[R2 开通](https://developers.cloudflare.com/r2/get-started/)、[生命周期](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)。

## 功能与检查

包含首次随机、角色选择、三种模式、柔和过渡、收藏、最近 50 张、标签展开、来源、移动端、自适应图片、键盘 Space / → / F、减少动态效果。收藏保存在当前浏览器 localStorage，不同步、不需要登录；清空浏览器数据会丢失。

```bash
npm run build
npm test
npm run check:worker
npm run verify:live
```

测试范围及实际结果见 `docs/TESTING.md`。线上首次验证务必包含 R2 miss、R2 hit、断网降级和 Network 同源检查。

## 项目结构

```text
src/                  保留的 React UI、样式、浏览器 API 与 localStorage
shared/               类型、角色白名单、安全策略、图片签名校验
worker/
  index.ts            路由、防刷、参数与错误处理
  routes/             random / image / health
  services/           Derpibooru 请求、R2 缓存
  config.ts, types.ts  Worker 配置与环境类型
server-node/          原 Express / 磁盘缓存备用方案
public/               favicon、生产安全响应头
tests/                安全与 Worker/R2 集成测试
scripts/              真实 API 验证
wrangler.toml         同域静态资源、R2、限流绑定
Dockerfile            可选 VPS 备用部署
.github/workflows/    GitHub 验证流程
```

## 可选 Node / Docker 备用方案

复制 `.env.example` 为 `.env`。运行 `npm run build:node`、`npm run start:node`，访问 `http://localhost:3000`；开发 API 用 `npm run dev:node`。若前端用 Vite，设置 `API_TARGET=http://127.0.0.1:3000` 后启动 `npm run dev`（PowerShell 用 `$env:API_TARGET='http://127.0.0.1:3000'`）。Node 版本使用 `cache/images`，默认 TTL 14 天、容量 5GB，定期清理；生产 Worker 完全不引用 Node 文件系统。

```bash
docker compose up --build -d
```

或 `docker build -t pony-roulette .`，再 `docker run -p 3000:3000 -v pony-cache:/app/cache pony-roulette`。VPS 可以考虑香港、日本、新加坡，但必须实测上游访问；Docker 不是 Cloudflare 主方案。

## 常见问题

- **大陆是否一定能访问？** 不保证。代理解决浏览器直连 Derpibooru 的问题；免费 `workers.dev` / `pages.dev` 域名和 Cloudflare 国际网络在大陆仍可能不稳定。自定义域名可另行尝试，但不等于大陆专线或稳定性承诺。
- **随机失败但收藏能看？** 上游不可用时是预期降级；有效 R2 图片无需上游。若收藏只缓存过主图，缩略图第一次加载仍需要上游，可打开收藏主图重试。
- **首次缓存为什么较慢？** Worker 需查询标签、下载图片、写入 R2；之后可命中边缘/R2/浏览器缓存。
- **404/415/413？** 分别可能是图片不再满足安全策略、格式不支持、图片超过上限；不会切换为浏览器直连。
- **部署找不到 R2？** 检查账户、订阅、bucket 名称和绑定 PONY_IMAGES。不要仅创建 Pages 静态项目。
- **本地 npm 找不到？** 安装完整 Node.js LTS，并重开终端。本次工具环境只有 node，通过临时 npm 运行安装；项目本身使用标准 npm 命令。
- **R2 写权限是否测试？** `/api/health` 做轻量读取检查；实际写入权限由首次图片 MISS 验证。health 的 `r2: ok` 不意味着已经写入测试对象。
