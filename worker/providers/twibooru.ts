import { z } from "zod";
import {
  contentAllows,
  normalizeGraphicLevel,
  normalizeRating,
} from "../../shared/content";
import type { NormalizedImage } from "../../shared/types";
import type { Env } from "../types";
import { providerJSON, ProviderError, readRateLimit } from "./http";
import type {
  PonyImageProvider,
  ProviderImageOptions,
  ProviderSearchOptions,
} from "./types";

const twibooruEverythingFilter = "2";
export const twibooruPostSchema = z
  .object({
    id: z.number().int().positive(),
    media_type: z.literal("image"),
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
    locations: z
      .array(
        z.object({
          location: z.string(),
          id_at_location: z.number().int().positive(),
          url_at_location: z.string().optional(),
        }),
      )
      .optional(),
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

type TwibooruPost = z.infer<typeof twibooruPostSchema>;

export function normalizeTwibooru(post: TwibooruPost): NormalizedImage {
  const derpibooruId = post.locations?.find(
    (location) => location.location.toLowerCase() === "derpibooru",
  )?.id_at_location;
  const sources = (post.source_urls ?? [post.source_url]).filter(
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
    provider: "twibooru",
    providerId: post.id,
    canonicalId: derpibooruId
      ? `derpibooru:${derpibooruId}`
      : `twibooru:${post.id}`,
    derpibooruId,
    width: post.width,
    height: post.height,
    format: post.format ?? "",
    score: post.score,
    wilsonScore: post.wilson_score,
    upvotes: post.upvotes,
    downvotes: post.downvotes,
    favorites: post.faves,
    tags: post.tags,
    artists: post.tags.filter((tag) => tag.startsWith("artist:")),
    sourceUrl: sources[0],
    sourceUrls: sources,
    pageUrl: `https://twibooru.org/posts/${post.id}`,
    rating: normalizeRating("twibooru", post.tags),
    graphicLevel: normalizeGraphicLevel("twibooru", post.tags),
    spoilered: post.spoilered ?? true,
    featured: post.tags.includes("featured image"),
    createdAt: post.created_at,
    representations: post.representations,
  };
}

async function request(env: Env, path: string, params: Record<string, string>) {
  const url = new URL(`/api/v3/${path}`, "https://twibooru.org");
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const result = await providerJSON(env, "twibooru", url);
  const rate = readRateLimit(result.headers);
  if (rate.remaining !== undefined && rate.remaining <= 0)
    throw new ProviderError(
      "Twibooru rate limit exhausted",
      "twibooru",
      429,
      true,
      "rate_limit",
    );
  return result.value;
}

function parsePost(
  raw: unknown,
  options: ProviderSearchOptions | ProviderImageOptions,
) {
  const parsed = twibooruPostSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.deletion_reason ||
    parsed.data.hidden_from_users
  )
    return undefined;
  const image = normalizeTwibooru(parsed.data);
  return contentAllows(image, options.content) ? image : undefined;
}

export const twibooruProvider: PonyImageProvider = {
  id: "twibooru",
  label: "Twibooru",
  async searchRandom(env, options) {
    const value = await request(env, "search/posts", {
      q: options.query,
      sf: "random",
      per_page: "3",
      filter_id: twibooruEverythingFilter,
    });
    const envelope = z.object({ posts: z.array(z.unknown()) }).safeParse(value);
    if (!envelope.success)
      throw new ProviderError(
        "Incompatible Twibooru response",
        "twibooru",
        502,
        true,
        "invalid_response",
      );
    const images = envelope.data.posts.flatMap((candidate) => {
      const image = parsePost(candidate, options);
      return image && image.canonicalId !== options.excludeCanonicalId
        ? [image]
        : [];
    });
    if (!images.length)
      throw new ProviderError(
        "No matching image",
        "twibooru",
        404,
        true,
        "no_match",
      );
    return images[Math.floor(Math.random() * images.length)]!;
  },
  async getImage(env, id, options) {
    const value = await request(env, `posts/${id}`, {
      filter_id: twibooruEverythingFilter,
    });
    const envelope = z.object({ post: z.unknown() }).safeParse(value);
    const image = envelope.success
      ? parsePost(envelope.data.post, options)
      : undefined;
    if (!image || image.providerId !== id)
      throw new ProviderError(
        "Image unavailable under current content settings",
        "twibooru",
        404,
        false,
        "not_allowed",
      );
    return image;
  },
  async healthCheck(env) {
    await request(env, "search/posts", {
      q: "safe",
      per_page: "1",
      filter_id: twibooruEverythingFilter,
    });
    return true;
  },
};
