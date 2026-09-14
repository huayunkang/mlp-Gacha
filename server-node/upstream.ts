import { fetch, EnvHttpProxyAgent } from "undici";
import { config } from "./config.js";
import {
  imageSchema,
  safeImage,
  query,
  type UpstreamImage,
  cdnUrl,
} from "../shared/legacy-safety.js";
import type { Character, Mode } from "../shared/types.js";
const dispatcher = new EnvHttpProxyAgent();
export class UpstreamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export const connectivity: {
  state: "checking" | "reachable" | "unreachable";
  checkedAt: string | null;
} = { state: "checking", checkedAt: null };
export async function request(
  url: URL,
  maxBytes: number,
): Promise<{ data: Buffer; mime: string }> {
  let last: unknown;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const response = await fetch(url, {
        dispatcher,
        redirect: "error",
        signal: AbortSignal.timeout(config.timeout),
        headers: {
          "User-Agent": "PonyRoulette/1.0 (safe art discovery)",
          Accept: "application/json,image/*",
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new UpstreamError(
          `Upstream HTTP ${response.status}`,
          response.status,
        );
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new UpstreamError("Response too large", 413);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const part of response.body!) {
        size += part.length;
        if (size > maxBytes) throw new UpstreamError("Response too large", 413);
        chunks.push(Buffer.from(part));
      }
      return {
        data: Buffer.concat(chunks),
        mime: (response.headers.get("content-type") ?? "")
          .split(";")[0]
          .toLowerCase(),
      };
    } catch (error) {
      last = error;
      if (
        error instanceof UpstreamError &&
        error.status < 500 &&
        error.status !== 429
      )
        break;
      if (attempt < config.retries)
        await new Promise((r) => setTimeout(r, 500 * 3 ** attempt));
    }
  }
  throw last;
}
async function json(endpoint: string, params: Record<string, string> = {}) {
  try {
    const u = new URL("/api/v1/json/" + endpoint, config.base);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const result = JSON.parse(
      (await request(u, 4 * 1024 ** 2)).data.toString(),
    );
    connectivity.state = "reachable";
    connectivity.checkedAt = new Date().toISOString();
    return result;
  } catch (e) {
    connectivity.state = "unreachable";
    connectivity.checkedAt = new Date().toISOString();
    throw e;
  }
}
export const upstream = {
  async search(character: Character, mode: Mode): Promise<UpstreamImage[]> {
    const result = await json("search/images", {
      q: query(character, mode),
      sf: "random",
      per_page: String(config.poolSize),
    });
    if (!Array.isArray(result.images))
      throw new Error("Invalid search response");
    return result.images.flatMap((raw: unknown) => {
      const parsed = imageSchema.safeParse(raw);
      return parsed.success && safeImage(parsed.data) ? [parsed.data] : [];
    });
  },
  async image(id: number): Promise<UpstreamImage> {
    const result = imageSchema.parse((await json(`images/${id}`)).image);
    if (result.id !== id || !safeImage(result))
      throw new UpstreamError("Image unavailable or outside safe policy", 404);
    return result;
  },
  async download(url: string) {
    return request(cdnUrl(url), config.maxImage);
  },
  async check() {
    try {
      await json("search/images", { q: "safe", per_page: "1" });
    } catch {
      console.warn(
        "[upstream] Derpibooru unreachable; cached images remain available",
      );
    }
  },
};
export type Upstream = typeof upstream;
