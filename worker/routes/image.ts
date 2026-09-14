import { z } from "zod";
import { cachedImage, POLICY_VERSION } from "../services/cache";
import { settings } from "../config";
import type { Env } from "../types";
import { getProviderImage } from "../services/providers";
import { resolveFilter } from "../services/filters";
import { contentFields, contentSettings, providerAndId } from "./params";

function conditional(request: Request, response: Response) {
  const etags = request.headers
    .get("If-None-Match")
    ?.split(",")
    .map((value) => value.trim().replace(/^W\//, ""));
  if (
    etags?.some((etag) => etag === "*" || etag === response.headers.get("ETag"))
  ) {
    void response.body?.cancel();
    return new Response(null, { status: 304, headers: response.headers });
  }
  return response;
}

export async function imageRoute(
  request: Request,
  url: URL,
  path: string,
  env: Env,
  ctx: ExecutionContext,
) {
  const { provider, id } = providerAndId(path);
  const params = z
    .object({
      size: z.enum(["preview", "saver", "original"]).optional(),
      filter: z
        .string()
        .regex(/^(0|[1-9]\d{0,9})$/)
        .optional(),
      ...contentFields,
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
  const content = contentSettings(params);
  const config = settings(env);
  const edgeURL = new URL(
    `/__image-cache/${POLICY_VERSION}/${provider}/${id}/${content.contentLevel}/${content.adultMode}/${content.graphicLevel}/${filter.id}/${typeof preview === "string" ? preview : preview ? "preview" : "full"}`,
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
  const image = await getProviderImage(env, provider, id, content, filter.id);
  const media = await cachedImage(env, preview, image);
  const headers = new Headers({
    "Content-Type": media.mime,
    "Content-Length": String(media.size),
    "Cache-Control": "public, max-age=86400",
    ETag: media.etag,
    "X-Cache": media.hit,
    "X-Pony-Provider": provider,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  const response = new Response(media.body, { headers });
  if (config.edgeSeconds > 0) {
    const edge = response.clone();
    edge.headers.set("Cache-Control", `public, max-age=${config.edgeSeconds}`);
    ctx.waitUntil(caches.default.put(cacheKey, edge).catch(() => {}));
  }
  return conditional(request, response);
}
