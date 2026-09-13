import { z } from "zod";
import {
  characters,
  type Character,
  type Mode,
  type Pony,
} from "../shared/types.js";
import { blocked } from "./policy.js";
export { blocked } from "./policy.js";
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
  format: z.string().optional(),
  created_at: z.string().optional(),
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
export function eligibleImage(image: UpstreamImage, strictSafe = true) {
  return (
    !image.deletion_reason &&
    !image.hidden_from_users &&
    (!strictSafe ||
      (image.tags.includes("safe") &&
        !blocked.some((t) => image.tags.includes(t))))
  );
}
// Retained for V1 callers and tests. Strict mode is the default.
export function safeImage(image: UpstreamImage) {
  return eligibleImage(image, true);
}
export function query(character: Character, mode: Mode, strictSafe = true) {
  return [
    ...(strictSafe ? ["safe", ...blocked.map((t) => `-${t}`)] : []),
    "(mime_type:image/jpeg OR mime_type:image/png OR mime_type:image/webp OR mime_type:image/gif)",
    ...(character === "all" ? [] : [characters[character].toLowerCase()]),
    ...(mode === "top"
      ? ["score.gt:100"]
      : mode === "featured"
        ? ["featured image"]
        : []),
  ].join(",");
}
function imageURL(
  id: number,
  filterId: number | undefined,
  strictSafe: boolean,
  size?: "preview",
) {
  const params = new URLSearchParams({
    filter: String(filterId ?? 0),
    strict: strictSafe ? "1" : "0",
  });
  if (size) params.set("size", size);
  return `/api/image/${id}?${params}`;
}
export function publicPony(
  i: UpstreamImage,
  filterId?: number,
  strictSafe = true,
): Pony {
  return {
    id: i.id,
    filterId,
    strictSafe,
    image: imageURL(i.id, filterId, strictSafe),
    preview: imageURL(i.id, filterId, strictSafe, "preview"),
    width: i.width,
    height: i.height,
    tags: i.tags,
    artists: i.tags.filter((t) => t.startsWith("artist:")),
    score: i.score,
    spoilered: i.spoilered ?? true,
    wilsonScore: i.wilson_score,
    favorites: i.faves,
    upvotes: i.upvotes,
    featured: i.tags.includes("featured image"),
    format: i.format,
    createdAt: i.created_at,
    sources: i.source_urls?.filter((s) => {
      try {
        return ["https:", "http:"].includes(new URL(s).protocol);
      } catch {
        return false;
      }
    }),
    sourceUrl: `https://derpibooru.org/images/${i.id}`,
  };
}
export function cdnUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !["derpicdn.net", "derpibooru.org"].some(
      (host) => u.hostname === host || u.hostname.endsWith("." + host),
    ) ||
    u.username ||
    u.password ||
    u.port
  )
    throw new Error("Rejected upstream image host");
  return u;
}
