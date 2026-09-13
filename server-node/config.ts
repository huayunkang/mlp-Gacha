import "dotenv/config";
import path from "node:path";
import { z } from "zod";
const number = (value: unknown, fallback: number, min: number, max: number) =>
  z.coerce
    .number()
    .int()
    .min(min)
    .max(max)
    .parse(value ?? fallback);
const base = new URL(
  process.env.DERPIBOORU_BASE_URL ?? "https://derpibooru.org",
);
if (base.origin !== "https://derpibooru.org" || base.username || base.password)
  throw new Error("DERPIBOORU_BASE_URL must be https://derpibooru.org");
export const config = {
  base: base.origin,
  port: number(process.env.PORT, 3000, 1, 65535),
  cacheDir: path.resolve(process.env.CACHE_DIR ?? "./cache"),
  ttl: number(process.env.CACHE_TTL_DAYS, 14, 1, 30) * 86400000,
  maxCache: number(process.env.CACHE_MAX_SIZE_MB, 5000, 1, 100000) * 1024 ** 2,
  poolSize: number(process.env.RANDOM_POOL_SIZE, 20, 10, 30),
  timeout: number(process.env.REQUEST_TIMEOUT_MS, 10000, 100, 60000),
  retries: number(process.env.REQUEST_RETRIES, 2, 0, 3),
  maxImage: number(process.env.MAX_IMAGE_SIZE_MB, 25, 1, 100) * 1024 ** 2,
  trustProxy: number(process.env.TRUST_PROXY_HOPS, 0, 0, 5),
};
