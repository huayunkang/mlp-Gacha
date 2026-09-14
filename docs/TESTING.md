# 测试入口

2026-09-14 的 V3 Provider、内容分级、无 R2 部署与实测记录见 [V3.md](V3.md)。以下内容为 V2 历史验收记录。

2026-09-13 的 V2 验收结果见 [V2.md](V2.md)，自动测试记录为 test-results/v2-tests.txt。下文保留 V1 历史验收记录。

# 测试记录

测试日期：2026-09-12。环境：Windows、Node 24、TypeScript、Wrangler 4.131.1 及配套 workerd / Miniflare。项目要求 Node >=22。

## 已实际执行

- `npm install`：通过，生成 lockfile，安装报告无已知漏洞。
- `npm run build`：前端和 Worker TypeScript 检查、Vite 生产构建通过。
- `npm run build:node`：备用 Express 版本编译通过。
- `npm run dev:all`：Vite 5173 与 Wrangler 8787 同时启动成功。
- `npm run check:worker`：dry run 打包通过，正确识别静态资源、R2 和三个限流绑定；没有发布线上资源。
- `npm test`：11 项通过；独立 workerd 运行环境，真实本地 R2 / Cache API / Rate Limit bindings；上游替换为受控测试响应，以便验证安全和失败场景。
- 真实 Derpibooru API：完全随机、Fluttershy、高评分、Featured 通过，结果见 README。
- 真实 CDN 图片通过 Worker：图片 2663289，JPEG，126997 bytes。先 `X-Cache: MISS`，随后 `EDGE-HIT`；关闭边缘缓存后复测 `R2-HIT`。ETag `a5a5c0b578f5adbf550c4e661940114a`。
- 本地代理辅助 Worker `/api/health` 返回 `ok / reachable / r2: ok`。

## 自动测试覆盖

- 输出只包含本站图片 URL，随机接口 `no-store`。
- 未知角色/模式、额外/重复查询、任意 URL、非法图片 ID、跨站请求被拒绝。
- 搜索层和按 ID 读取均执行 safe 标签检查，unsafe 不写缓存。
- R2 首次下载写入、命中不访问上游、preview 独立 key、HTTP metadata、ETag 304。
- JPEG、PNG、WebP、GIF MIME/签名和字节传输（格式测试使用小型签名夹具，不声明其均为可解码完整艺术图片）。
- 超大响应、伪造 MIME、上游重定向被拒绝。
- 断网后有效 R2 图片仍能读取，random 友好 503，health degraded。
- 单 IP 超限返回 429 和 Retry-After。
- safe + fetish / bondage 同样拒绝；缓存策略升级为 safe-v2。
- 有限次数重试、500ms / 1500ms 退避、超时取消。

## 浏览器验收方法

通过 Codex 浏览器在本地 Worker 上点测。真实图来自 Derpibooru，浏览器只访问本机同源 API。网络检查使用单独测试产物里的 Resource Timing 观察器，记录实际脚本、CSS、fetch、主图、预加载和缩略图请求；该观察器不进入生产 dist/client。

实际点测通过：首次自动抽取、再来一张、Fluttershy 筛选、高分（208 分）、Featured、收藏与刷新后保留、历史列表与重开、标签展开、F 收藏和 Space 下一张、设置弹窗。发现带 fetish/bondage 的 safe 图后收紧策略，并在最终策略下重新验证四种真实查询。

390×844、430×932、1920×1080、2560×1440 的 document scrollWidth 均未超过 clientWidth（有系统竖向滚动条时 clientWidth 少 15px）。横图、竖图、正方形、超宽图均使用 contain 显示。

最终网络采样共 19 个资源请求，origin 集合只有 `http://127.0.0.1:8788`，包括主图、历史预览及下一张预加载。无 derpibooru.org / derpicdn.net 自动请求。

浏览器断网验收：本地测试启动器设置 `QA_OFFLINE=1` 模拟全部上游 503，页面显示「暂时没找到小马，再试一次 ✨」并保留重试按钮。打开收藏 3598883 仍成功，主图 naturalWidth > 0；服务重启后缓存仍存在。测试后已恢复真实上游、关闭 QA 产物。

可复建诊断产物：`node scripts/prepare-browser-qa.mjs`，设置 `QA_NETWORK=1` 与自己的 `HTTPS_PROXY` 后 `npm run dev:proxy`。浏览器 DOM 的隐藏 `#qa-network` 含实际资源请求列表。

## 范围限制

未登录 Cloudflare 账户、未创建远程 R2、未发布线上 Worker。真实 Cloudflare 出站网络、大陆各运营商访问质量、线上 CPU 额度和 R2 账单，需要部署后实测。

本机原生 `wrangler dev` 能启动并操作模拟 R2，但上游直连受本机网络限制；真实上游验收使用同份 Worker 的本地代理启动器，不将这一结果冒充线上 Cloudflare 验证。

Dockerfile 已提供，当前环境未运行 Docker daemon，因此没有声称完成容器运行验收。
