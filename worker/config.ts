import type { Env } from "./types";
function number(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error("Invalid Worker configuration");
  return n;
}
export function settings(env: Env) {
  if (
    env.DERPIBOORU_BASE_URL &&
    env.DERPIBOORU_BASE_URL !== "https://derpibooru.org"
  )
    throw new Error("Unsupported API origin");
  return {
    timeout: number(env.REQUEST_TIMEOUT_MS, 10000, 100, 30000),
    providerTimeout: number(env.PROVIDER_TIMEOUT_MS, 3500, 500, 10000),
    retries: number(env.REQUEST_RETRIES, 2, 0, 2),
    maxBytes: number(env.MAX_IMAGE_SIZE_MB, 8, 1, 16) * 1024 ** 2,
    ttl: number(env.CACHE_TTL_DAYS, 30, 1, 90) * 86400000,
    edgeSeconds: number(env.EDGE_CACHE_SECONDS, 3600, 0, 86400),
  };
}
