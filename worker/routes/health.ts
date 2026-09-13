import type { Env } from "../types";
import { checkUpstream } from "../services/derpibooru";
export async function healthRoute(url: URL, env: Env, ctx: ExecutionContext) {
  const key = new Request(new URL("/__health-v1", url.origin).toString());
  const previous = await caches.default.match(key);
  if (previous) {
    const result = new Response(previous.body, previous);
    result.headers.set("Cache-Control", "no-store");
    return result;
  }
  const [derpi, r2] = await Promise.allSettled([
    checkUpstream(env),
    env.PONY_IMAGES.head("__health_check__"),
  ]);
  const healthy = derpi.status === "fulfilled" && r2.status === "fulfilled";
  const response = Response.json(
    {
      status: healthy ? "ok" : "degraded",
      derpibooru: derpi.status === "fulfilled" ? "reachable" : "unreachable",
      r2: r2.status === "fulfilled" ? "ok" : "error",
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
  ctx.waitUntil(caches.default.put(key, response.clone()).catch(() => {}));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
