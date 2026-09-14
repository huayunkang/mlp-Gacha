import type {
  ContentSettings,
  NormalizedImage,
  ProviderId,
} from "../../shared/types";
import type { Env } from "../types";

export interface ProviderSearchOptions {
  query: string;
  content: ContentSettings;
  filterId?: number;
  excludeCanonicalId?: string;
}

export interface ProviderImageOptions {
  content: ContentSettings;
  filterId?: number;
}

export interface PonyImageProvider {
  id: ProviderId;
  label: string;
  searchRandom(
    env: Env,
    options: ProviderSearchOptions,
  ): Promise<NormalizedImage>;
  getImage(
    env: Env,
    id: number,
    options: ProviderImageOptions,
  ): Promise<NormalizedImage>;
  healthCheck(env: Env): Promise<boolean>;
}

export interface ProviderRateLimit {
  limit?: number;
  remaining?: number;
  reset?: string;
}
