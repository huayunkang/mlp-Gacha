import { z } from "zod";
import { cachedImage, POLICY_VERSION } from "../services/cache";
import { settings } from "../config";
import type { Env } from "../types";
import { getFilteredImage } from "../services/derpibooru";
import { resolveFilter } from "../services/filters";
function conditional(request: Request, response: Response) {
  const etags = request.headers
    .get("If-None-Match")
    ?.split(",")
    .map((x) => x.trim().replace(/^W\//, ""));
  if (etags?.some((t) => t === "*" || t === response.headers.get("ETag"))) {
    void response.body?.cancel();
    return new Response(null, { status: 304, headers: response.headers });
  }
  return response;
}
export async function imageRoute(
  request: Request,
  url: URL,
  idString: string,
  env: Env,
  ctx: ExecutionContext,
) {
  const id = Number(
    z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .parse(idString),
  );
  const params = z
    .object({
      size: z.enum(["preview", "saver", "original"]).optional(),
      filter: z
        .string()
        .regex(/^(0|[1-9]\d{0,9})$/)
        .optional(),
      strict: z.enum(["0", "1"]).default("1"),
    })
    .strict()
    .parse(Object.fromEntries(url.searchParams));
  const preview =
    params.size === "saver" || params.size === "original"
      ? params.size
      : params.size === "preview";
  const filter = await resolveFilter(
    env,
    params.filter === undefined ? undefined : Number(params.filter),
  );
  const strictSafe = filter.id === 0 || params.strict === "1";
  const config = settings(env);
  const edgeURL = new URL(
    `/__image-cache/${POLICY_VERSION}/${filter.id}/${strictSafe ? "strict" : "native"}/${id}/${typeof preview === "string" ? preview : preview ? "preview" : "full"}`,
    url.origin,
  );
  const cacheKey = new Request(edgeURL.toString());
  if (config.edgeSeconds > 0) {
    const hit = await caches.default.match(cacheKey);
    if (hit) {
      const response = new Response(hit.body, hit);
      response.headers.set("X-Cache", "EDGE-HIT");
      response.headers.set("Cache-Control", "public, max-age=86400");
      return conditional(request, response);
    }
  }
  const image = await getFilteredImage(env, id, filter.id, strictSafe);
  const { object, hit } = await cachedImage(env, id, preview, image);
  const headers = new Headers({
    "Content-Type": object.httpMetadata!.contentType!,
    "Content-Length": String(object.size),
    "Cache-Control": "public, max-age=86400",
    ETag: object.httpEtag,
    "X-Cache": hit ? "R2-HIT" : "MISS",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  const response = new Response(object.body, { headers });
  if (config.edgeSeconds > 0) {
    const edge = response.clone();
    edge.headers.set("Cache-Control", `public, max-age=${config.edgeSeconds}`);
    ctx.waitUntil(caches.default.put(cacheKey, edge).catch(() => {}));
  }
  return conditional(request, response);
}
