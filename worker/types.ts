export interface Env {
  ASSETS: Fetcher;
  /** Optional compatibility cache. Production works without an R2 binding. */
  PONY_IMAGES?: R2Bucket;
  RANDOM_LIMITER: RateLimit;
  IMAGE_LIMITER: RateLimit;
  HEALTH_LIMITER: RateLimit;
  DERPIBOORU_BASE_URL: string;
  DERPIBOORU_API_KEY?: string;
  REQUEST_TIMEOUT_MS: string;
  PROVIDER_TIMEOUT_MS?: string;
  REQUEST_RETRIES: string;
  MAX_IMAGE_SIZE_MB: string;
  CACHE_TTL_DAYS: string;
  EDGE_CACHE_SECONDS: string;
}
