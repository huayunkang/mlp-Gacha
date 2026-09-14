import { mediaUrl } from "../../shared/safety";
import type { ProviderId } from "../../shared/types";
import type { Env } from "../types";
import { settings } from "../config";
import { ServiceError } from "./errors";

export { ServiceError } from "./errors";

export async function fetchBytes(
  url: URL,
  env: Env,
  maxBytes: number,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const config = settings(env);
  let last: unknown;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeout),
        headers: {
          "User-Agent": "PonyRoulette/2.0 (MLP image discovery; cached proxy)",
          Accept: "application/json,image/*",
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ServiceError(
          `Upstream HTTP ${response.status}`,
          response.status === 404
            ? 404
            : response.status === 429
              ? 429
              : response.status >= 500
                ? 503
                : 502,
        );
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new ServiceError("Response too large", 413);
      }
      if (!response.body) throw new ServiceError("Empty response");
      const reader = response.body.getReader();
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
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
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
        mime: (response.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase(),
      };
    } catch (error) {
      last = error;
      if (
        error instanceof ServiceError &&
        [404, 413, 502].includes(error.status)
      )
        break;
      if (attempt < config.retries)
        await new Promise((resolve) => setTimeout(resolve, 500 * 3 ** attempt));
    }
  }
  throw last;
}

export async function json(
  env: Env,
  endpoint: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`/api/v1/json/${endpoint}`, "https://derpibooru.org");
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

export async function downloadImage(
  env: Env,
  provider: ProviderId,
  value: string,
) {
  return fetchBytes(mediaUrl(provider, value), env, settings(env).maxBytes);
}
