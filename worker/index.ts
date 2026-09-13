import { z } from "zod";
import type { Env } from "./types";
import { randomRoute } from "./routes/random";
import { imageRoute } from "./routes/image";
import { healthRoute } from "./routes/health";
import { ServiceError, getFilteredImage } from "./services/derpibooru";
import { getFilters, resolveFilter } from "./services/filters";
import { publicPony } from "../shared/safety";
function error(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    let response: Response;
    try {
      if (request.method !== "GET") return error("仅支持 GET 请求。", 405);
      if (request.headers.get("sec-fetch-site") === "cross-site")
        return error("请从本站查看图片。", 403);
      if (
        [...url.searchParams.keys()].some(
          (k, _i, keys) => keys.indexOf(k) !== keys.lastIndexOf(k),
        )
      )
        return error("重复的请求参数。", 400);
      const route = url.pathname;
      const limiter =
        route === "/api/random"
          ? env.RANDOM_LIMITER
          : route === "/api/health"
            ? env.HEALTH_LIMITER
            : env.IMAGE_LIMITER;
      if (
        !(
          await limiter.limit({
            key: request.headers.get("CF-Connecting-IP") ?? "local",
          })
        ).success
      )
        return error("慢一点，让小马休息一下。请稍后重试 ✨", 429);
      if (route === "/api/random") response = await randomRoute(url, env);
      else if (route === "/api/filters") {
        z.object({}).strict().parse(Object.fromEntries(url.searchParams));
        response = Response.json(await getFilters(env), {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      } else if (route.startsWith("/api/metadata/")) {
        const id = Number(
          z
            .string()
            .regex(/^[1-9]\d{0,9}$/)
            .parse(route.slice("/api/metadata/".length)),
        );
        const p = z
          .object({
            filter: z
              .string()
              .regex(/^(0|[1-9]\d{0,9})$/)
              .optional(),
            strict: z.enum(["0", "1"]).default("1"),
          })
          .strict()
          .parse(Object.fromEntries(url.searchParams));
        const f = await resolveFilter(
          env,
          p.filter === undefined ? undefined : Number(p.filter),
        );
        const strictSafe = f.id === 0 || p.strict === "1";
        response = Response.json(
          publicPony(
            await getFilteredImage(env, id, f.id, strictSafe),
            f.id,
            strictSafe,
          ),
          { headers: { "Cache-Control": "no-store" } },
        );
      } else if (route === "/api/health")
        response = await healthRoute(url, env, ctx);
      else if (route.startsWith("/api/image/"))
        response = await imageRoute(
          request,
          url,
          route.slice("/api/image/".length),
          env,
          ctx,
        );
      else response = error("接口不存在。", 404);
    } catch (e) {
      const status =
        e instanceof z.ZodError
          ? 400
          : e instanceof ServiceError
            ? [400, 404, 413, 415, 429].includes(e.status)
              ? e.status
              : 503
            : 503;
      console.warn(
        JSON.stringify({
          event: "api_error",
          route: url.pathname,
          status,
          kind: e instanceof Error ? e.name : "Unknown",
          message:
            e instanceof z.ZodError
              ? "Invalid parameters"
              : e instanceof Error
                ? e.message.replace(/https?:\/\/\S+/g, "[upstream]")
                : "Unknown",
        }),
      );
      response = error(
        status === 400
          ? "请求参数不正确。"
          : status === 404
            ? "这个组合暂时没有找到图片，或图片无法公开展示。请切换 Random 或取消角色筛选。"
            : "暂时没找到小马，再试一次 ✨",
        status,
      );
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  },
} satisfies ExportedHandler<Env>;
