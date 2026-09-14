// Optional local workerd launcher for machines that require an HTTP proxy.
import { build } from "esbuild";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { fetch, EnvHttpProxyAgent } from "undici";
if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY)
  throw new Error("Set HTTPS_PROXY to your own local HTTP proxy first.");
const dispatcher = new EnvHttpProxyAgent();
const bundle = await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    port: 8788,
    host: "127.0.0.1",
    modules: true,
    script: bundle.outputFiles[0]!.text,
    compatibilityDate: "2026-09-01",
    assets: {
      directory: process.env.QA_NETWORK
        ? "test-results/qa-client"
        : "dist/client",
      binding: "ASSETS",
      run_worker_first: ["/api/*"],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: "single-page-application" },
    },
    bindings: {
      DERPIBOORU_BASE_URL: "https://derpibooru.org",
      REQUEST_TIMEOUT_MS: "10000",
      PROVIDER_TIMEOUT_MS: "3500",
      REQUEST_RETRIES: "2",
      MAX_IMAGE_SIZE_MB: "8",
      CACHE_TTL_DAYS: "30",
      EDGE_CACHE_SECONDS: process.env.EDGE_CACHE_SECONDS ?? "3600",
    },
    ratelimits: {
      RANDOM_LIMITER: {
        namespace_id: "1001",
        simple: { limit: 60, period: 60 },
      },
      IMAGE_LIMITER: {
        namespace_id: "1002",
        simple: { limit: 240, period: 60 },
      },
      HEALTH_LIMITER: {
        namespace_id: "1003",
        simple: { limit: 12, period: 60 },
      },
    },
    outboundService: async (req) => {
      if (process.env.QA_OFFLINE === "1")
        return new MFResponse("Simulated upstream outage", { status: 503 });
      const upstream = new URL(req.url);
      const allowed = [
        "derpibooru.org",
        "derpicdn.net",
        "trixiebooru.org",
        "twibooru.org",
        "cdn.twibooru.org",
      ];
      if (
        upstream.protocol !== "https:" ||
        upstream.username ||
        upstream.password ||
        upstream.port ||
        !allowed.some(
          (host) =>
            upstream.hostname === host ||
            upstream.hostname.endsWith(`.${host}`),
        )
      )
        throw new Error("Rejected upstream host");
      const res = await fetch(req.url, {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: Object.fromEntries(req.headers),
      });
      return new MFResponse(
        res.body as ConstructorParameters<typeof MFResponse>[0],
        { status: res.status, headers: Object.fromEntries(res.headers) },
      );
    },
  }),
);
await mf.ready;
console.info("Local Worker + edge cache + your proxy: http://127.0.0.1:8788");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void mf
      .dispose()
      .then(() => dispatcher.close())
      .then(() => process.exit(0));
  });
