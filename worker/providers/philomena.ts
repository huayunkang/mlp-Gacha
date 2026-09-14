import { z } from "zod";
import {
  buildGraphicQuery,
  buildSexualQuery,
  contentAllows,
  normalizeGraphicLevel,
  normalizeRating,
} from "../../shared/content";
import type { NormalizedImage, ProviderId } from "../../shared/types";
import type { Env } from "../types";
import { providerJSON, ProviderError } from "./http";
import type {
  PonyImageProvider,
  ProviderImageOptions,
  ProviderSearchOptions,
} from "./types";

export const philomenaImageSchema = z
  .object({
    id: z.number().int().positive(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    tags: z.array(z.string()).max(2000),
    score: z.number().default(0),
    spoilered: z.boolean().optional(),
    wilson_score: z.number().optional(),
    faves: z.number().optional(),
    upvotes: z.number().optional(),
    downvotes: z.number().optional(),
    format: z.string().optional(),
    created_at: z.string().optional(),
    source_url: z.string().optional(),
    source_urls: z.array(z.string()).optional(),
    representations: z
      .object({
        full: z.string(),
        large: z.string().optional(),
        medium: z.string().optional(),
        small: z.string().optional(),
        thumb: z.string().optional(),
      })
      .passthrough(),
    deletion_reason: z.string().nullable().optional(),
    hidden_from_users: z.boolean().optional(),
  })
  .passthrough();

type PhilomenaImage = z.infer<typeof philomenaImageSchema>;

export function normalizePhilomena(
  provider: "derpibooru" | "trixiebooru",
  image: PhilomenaImage,
): NormalizedImage {
  const sources = (image.source_urls ?? [image.source_url]).filter(
    (value): value is string => {
      if (!value) return false;
      try {
        return ["https:", "http:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
  );
  return {
    provider,
    providerId: image.id,
    canonicalId: `derpibooru:${image.id}`,
    derpibooruId: image.id,
    width: image.width,
    height: image.height,
    format: image.format ?? "",
    score: image.score,
    wilsonScore: image.wilson_score,
    upvotes: image.upvotes,
    downvotes: image.downvotes,
    favorites: image.faves,
    tags: image.tags,
    artists: image.tags.filter((tag) => tag.startsWith("artist:")),
    sourceUrl: sources[0],
    sourceUrls: sources,
    pageUrl:
      provider === "derpibooru"
        ? `https://derpibooru.org/images/${image.id}`
        : `https://trixiebooru.org/images/${image.id}`,
    rating: normalizeRating(provider, image.tags),
    graphicLevel: normalizeGraphicLevel(provider, image.tags),
    spoilered: image.spoilered ?? true,
    featured: image.tags.includes("featured image"),
    createdAt: image.created_at,
    representations: image.representations,
  };
}

export function createPhilomenaProvider(config: {
  id: "derpibooru" | "trixiebooru";
  label: string;
  baseUrl: string;
  supportsDerpibooruFilter: boolean;
}): PonyImageProvider {
  const request = async (
    env: Env,
    path: string,
    params: Record<string, string>,
  ) => {
    const url = new URL(`/api/v1/json/${path}`, config.baseUrl);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    if (config.id === "derpibooru" && env.DERPIBOORU_API_KEY)
      url.searchParams.set("key", env.DERPIBOORU_API_KEY);
    return providerJSON(env, config.id, url);
  };

  const parseImages = (
    raw: unknown,
    options: ProviderSearchOptions | ProviderImageOptions,
    excludeCanonicalId?: string,
  ) => {
    const envelope = z.object({ images: z.array(z.unknown()) }).safeParse(raw);
    if (!envelope.success)
      throw new ProviderError(
        "Incompatible Philomena response",
        config.id,
        502,
        true,
        "invalid_response",
      );
    return envelope.data.images.flatMap((candidate) => {
      const parsed = philomenaImageSchema.safeParse(candidate);
      if (
        !parsed.success ||
        parsed.data.deletion_reason ||
        parsed.data.hidden_from_users
      )
        return [];
      const image = normalizePhilomena(config.id, parsed.data);
      return contentAllows(image, options.content) &&
        image.canonicalId !== excludeCanonicalId
        ? [image]
        : [];
    });
  };

  const filterParams = (filterId?: number): Record<string, string> =>
    config.supportsDerpibooruFilter && filterId
      ? { filter_id: String(filterId) }
      : {};

  return {
    id: config.id,
    label: config.label,
    async searchRandom(env, options) {
      const { value } = await request(env, "search/images", {
        q: options.query,
        sf: "random",
        per_page: "3",
        ...filterParams(options.filterId),
      });
      const images = parseImages(value, options, options.excludeCanonicalId);
      if (!images.length)
        throw new ProviderError(
          "No matching image",
          config.id,
          404,
          true,
          "no_match",
        );
      return images[Math.floor(Math.random() * images.length)]!;
    },
    async getImage(env, id, options) {
      const { value } = await request(env, "search/images", {
        q: [
          ...buildSexualQuery(
            options.content.contentLevel,
            options.content.adultMode,
          ),
          ...buildGraphicQuery(options.content.graphicLevel),
          `id:${id}`,
        ].join(","),
        per_page: "1",
        ...filterParams(options.filterId),
      });
      const images = parseImages(value, options);
      const image = images.find((candidate) => candidate.providerId === id);
      if (!image)
        throw new ProviderError(
          "Image unavailable under current content settings",
          config.id,
          404,
          false,
          "not_allowed",
        );
      return image;
    },
    async healthCheck(env) {
      await request(env, "search/images", { q: "safe", per_page: "1" });
      return true;
    },
  };
}
