import { z } from "zod";
import { characters, type Character, type Mode, type Pony } from "./types.js";
import { blocked } from "./policy.js";

// Compatibility helpers for the optional legacy Node server. Production uses
// the provider adapters and shared/content.ts instead.
export const imageSchema = z.object({
  id: z.number().int().positive(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  tags: z.array(z.string()).max(2000),
  score: z.number(),
  spoilered: z.boolean().optional(),
  wilson_score: z.number().optional(),
  faves: z.number().optional(),
  upvotes: z.number().optional(),
  downvotes: z.number().optional(),
  format: z.string().optional(),
  created_at: z.string().optional(),
  source_url: z.string().optional(),
  source_urls: z.array(z.string()).optional(),
  representations: z.object({
    full: z.string(),
    large: z.string().optional(),
    thumb: z.string().optional(),
    medium: z.string().optional(),
  }),
  deletion_reason: z.string().nullable().optional(),
  hidden_from_users: z.boolean().optional(),
});

export type UpstreamImage = z.infer<typeof imageSchema>;

export function safeImage(image: UpstreamImage) {
  return (
    !image.deletion_reason &&
    !image.hidden_from_users &&
    image.tags.includes("safe") &&
    !blocked.some((tag) => image.tags.includes(tag))
  );
}

export function query(character: Character, mode: Mode) {
  return [
    "safe",
    ...blocked.map((tag) => `-${tag}`),
    "(mime_type:image/jpeg OR mime_type:image/png OR mime_type:image/webp OR mime_type:image/gif)",
    ...(character === "all" ? [] : [characters[character].toLowerCase()]),
    ...(mode === "top"
      ? ["score.gt:100"]
      : mode === "featured"
        ? ["featured image"]
        : []),
  ].join(",");
}

export function legacyPublicPony(image: UpstreamImage): Pony {
  const params = new URLSearchParams({
    filter: "0",
    content: "safe",
    adultMode: "all",
    graphic: "clean",
  });
  const media = `/api/image/derpibooru/${image.id}?${params}`;
  return {
    provider: "derpibooru",
    providerId: image.id,
    canonicalId: `derpibooru:${image.id}`,
    derpibooruId: image.id,
    id: image.id,
    image: media,
    preview: `${media}&size=preview`,
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
    sourceUrl: image.source_url,
    sourceUrls: image.source_urls,
    pageUrl: `https://derpibooru.org/images/${image.id}`,
    rating: "safe",
    graphicLevel: "clean",
    spoilered: image.spoilered ?? true,
    featured: image.tags.includes("featured image"),
    createdAt: image.created_at,
    contentLevel: "safe",
    adultMode: "all",
    selectedGraphicLevel: "clean",
  };
}

export function cdnUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["derpicdn.net", "derpibooru.org"].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    ) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Rejected upstream image host");
  return url;
}
