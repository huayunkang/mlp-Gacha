import {
  imageSchema,
  eligibleImage,
  query,
  cdnUrl,
  type UpstreamImage,
} from "../../shared/safety";
import type { Character, Mode } from "../../shared/types";
import { characters } from "../../shared/types";
import type { Env } from "../types";
import { settings } from "../config";
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export async function fetchBytes(
  url: URL,
  env: Env,
  maxBytes: number,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const config = settings(env);
  let last: unknown;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeout),
        headers: {
          "User-Agent": "PonyRoulette/1.0 (safe art discovery)",
          Accept: "application/json,image/*",
        },
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new ServiceError(
          `Upstream HTTP ${res.status}`,
          res.status === 404
            ? 404
            : res.status === 429
              ? 429
              : res.status >= 500
                ? 503
                : 502,
        );
      }
      if (Number(res.headers.get("content-length")) > maxBytes) {
        await res.body?.cancel();
        throw new ServiceError("Response too large", 413);
      }
      if (!res.body) throw new ServiceError("Empty response");
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes)
            throw new ServiceError("Response too large", 413);
          chunks.push(value);
        }
      } catch (e) {
        await reader.cancel().catch(() => {});
        throw e;
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        bytes,
        mime: (res.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase(),
      };
    } catch (e) {
      last = e;
      if (e instanceof ServiceError && [404, 413, 502].includes(e.status))
        break;
      if (attempt < config.retries)
        await new Promise((r) => setTimeout(r, 500 * 3 ** attempt));
    }
  }
  throw last;
}
export async function json(
  env: Env,
  endpoint: string,
  params: Record<string, string> = {},
) {
  settings(env);
  const url = new URL("/api/v1/json/" + endpoint, "https://derpibooru.org");
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  if (env.DERPIBOORU_API_KEY)
    url.searchParams.set("key", env.DERPIBOORU_API_KEY);
  const result = await fetchBytes(url, env, 1024 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(result.bytes));
  } catch {
    throw new ServiceError("Invalid upstream JSON");
  }
}
export async function searchRandomImage(
  env: Env,
  character: Character,
  mode: Mode,
  exclude?: number,
  filterId?: number,
  tag?: string,
  strictSafe = true,
): Promise<UpstreamImage> {
  // No durable in-memory pool: every request also works in a fresh isolate.
  const keys = Object.keys(characters).filter(
    (k) => k !== "all",
  ) as Character[];
  const picked =
    mode === "surprise"
      ? keys[Math.floor(Math.random() * keys.length)]!
      : character;
  const themes = ["solo", "smiling", "scenery", "cute"];
  const result = await json(env, "search/images", {
    q:
      query(picked, mode, strictSafe) +
      (mode === "surprise"
        ? "," + themes[Math.floor(Math.random() * themes.length)]!
        : "") +
      (tag ? "," + tag : ""),
    sf: "random",
    per_page: "3",
    ...(filterId ? { filter_id: String(filterId) } : {}),
  });
  if (!Array.isArray(result.images))
    throw new ServiceError("Invalid image search");
  const images: UpstreamImage[] = result.images.flatMap((raw: unknown) => {
    const parsed = imageSchema.safeParse(raw);
    return parsed.success &&
      eligibleImage(parsed.data, strictSafe) &&
      parsed.data.id !== exclude
      ? [parsed.data]
      : [];
  });
  if (!images.length)
    throw new ServiceError(
      "这个组合暂时没有找到图片。请切换 Random 或取消角色筛选。",
      404,
    );
  return images[Math.floor(Math.random() * images.length)]!;
}
function accessKey(id: number, filterId: number, strictSafe: boolean) {
  return new Request(
    `https://pony.internal/__filtered-image/${filterId}/${strictSafe ? "strict" : "native"}/${id}`,
  );
}
export async function rememberFilteredImage(
  image: UpstreamImage,
  filterId: number,
  strictSafe: boolean,
) {
  await caches.default
    .put(
      accessKey(image.id, filterId, strictSafe),
      Response.json(image, {
        headers: { "Cache-Control": "public, max-age=21600" },
      }),
    )
    .catch(() => {});
}
export async function getFilteredImage(
  env: Env,
  id: number,
  filterId: number,
  strictSafe = true,
) {
  const cached = await caches.default.match(
    accessKey(id, filterId, strictSafe),
  );
  if (cached) {
    const parsed = imageSchema.safeParse(await cached.json());
    if (parsed.success && eligibleImage(parsed.data, strictSafe))
      return parsed.data;
  }
  const result = await json(env, "search/images", {
    q: query("all", "random", strictSafe) + `,id:${id}`,
    per_page: "1",
    ...(filterId ? { filter_id: String(filterId) } : {}),
  });
  const parsed = imageSchema.safeParse(result.images?.[0]);
  if (
    !parsed.success ||
    parsed.data.id !== id ||
    !eligibleImage(parsed.data, strictSafe)
  )
    throw new ServiceError("Image unavailable under current filter", 404);
  await rememberFilteredImage(parsed.data, filterId, strictSafe);
  return parsed.data;
}
export async function getImageById(
  env: Env,
  id: number,
): Promise<UpstreamImage> {
  const parsed = imageSchema.safeParse((await json(env, `images/${id}`)).image);
  if (!parsed.success) throw new ServiceError("Invalid image metadata");
  if (parsed.data.id !== id || !eligibleImage(parsed.data))
    throw new ServiceError("Image outside safe policy", 404);
  return parsed.data;
}
export async function downloadImage(env: Env, url: string) {
  return fetchBytes(cdnUrl(url), env, settings(env).maxBytes);
}
export async function checkUpstream(env: Env) {
  await json(env, "search/images", { q: "safe", per_page: "1" });
}
