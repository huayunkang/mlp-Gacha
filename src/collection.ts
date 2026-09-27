import { rarity, rarities } from "../shared/rarity";
import type { SavedPony } from "../shared/types";
import { migrateSavedPony } from "./storage";
import { normalizeRating, normalizeGraphicLevel } from "../shared/content";

export type CollectionSort = "recent" | "score" | "rarity";
export function searchCollection(
  items: SavedPony[],
  query: string,
  sort: CollectionSort,
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((item) => {
      const text =
        `${item.providerId} ${item.provider} ${item.tags.join(" ")} ${item.artists.join(" ")}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => {
      const rank =
        sort === "score"
          ? b.score - a.score
          : sort === "rarity"
            ? rarities.indexOf(rarity(b)) - rarities.indexOf(rarity(a))
            : 0;
      return rank || b.savedAt - a.savedAt;
    });
}

export function parseFavoritesBackup(text: string): SavedPony[] {
  if (text.length > 5 * 1024 * 1024) throw new Error("备份文件不能超过 5 MB。");
  const data = JSON.parse(text);
  if (
    data?.app !== "pony-roulette" ||
    data.version !== 1 ||
    !Array.isArray(data.favorites) ||
    data.favorites.length > 1000
  )
    throw new Error("请选择 Pony Roulette 收藏备份文件。");
  const items = data.favorites.map((value: unknown) => {
    const item = migrateSavedPony(value);
    if (
      !item ||
      item.providerId <= 0 ||
      item.width <= 0 ||
      item.height <= 0 ||
      item.savedAt < 0 ||
      item.tags.length > 2000 ||
      item.artists.length > 100 ||
      [...item.tags, ...item.artists].some((tag) => tag.length > 500) ||
      (item.derpibooruId !== undefined &&
        (!Number.isSafeInteger(item.derpibooruId) || item.derpibooruId <= 0))
    )
      throw new Error("备份中包含无效收藏记录。");
    const rating = normalizeRating(item.provider, item.tags);
    const graphicLevel = normalizeGraphicLevel(item.provider, item.tags);
    const canonicalId =
      item.provider === "twibooru" && !Number.isSafeInteger(item.derpibooruId)
        ? `twibooru:${item.providerId}`
        : `derpibooru:${item.derpibooruId ?? item.providerId}`;
    return {
      id: item.providerId,
      provider: item.provider,
      providerId: item.providerId,
      derpibooruId: item.derpibooruId,
      canonicalId,
      width: item.width,
      height: item.height,
      score: item.score,
      tags: item.tags,
      artists: item.artists,
      savedAt: item.savedAt,
      format: typeof item.format === "string" ? item.format.slice(0, 20) : "",
      wilsonScore: Number.isFinite(item.wilsonScore)
        ? item.wilsonScore
        : undefined,
      favorites: Number.isFinite(item.favorites) ? item.favorites : undefined,
      upvotes: Number.isFinite(item.upvotes) ? item.upvotes : undefined,
      downvotes: Number.isFinite(item.downvotes) ? item.downvotes : undefined,
      featured: item.featured === true,
      filterId:
        Number.isSafeInteger(item.filterId) && item.filterId! > 0
          ? item.filterId
          : undefined,
      contentLevel:
        rating === "suggestive"
          ? ("teen" as const)
          : rating === "explicit" || rating === "questionable"
            ? ("adult" as const)
            : ("safe" as const),
      adultMode: "all" as const,
      selectedGraphicLevel:
        graphicLevel === "unknown" ? ("clean" as const) : graphicLevel,
      pageUrl: `https://${item.provider}.org/${item.provider === "twibooru" ? "posts" : "images"}/${item.providerId}`,
      sourceUrl: undefined,
      sourceUrls: undefined,
      image: "",
      preview: "",
      rating,
      graphicLevel,
      spoilered: true,
    };
  });
  return [
    ...new Map<string, SavedPony>(
      items.map((item: SavedPony) => [item.canonicalId, item]),
    ).values(),
  ];
}

export function mergeFavorites(existing: SavedPony[], incoming: SavedPony[]) {
  const merged = new Map(existing.map((item) => [item.canonicalId, item]));
  for (const item of incoming) {
    if (merged.size >= 1000) break;
    if (!merged.has(item.canonicalId)) merged.set(item.canonicalId, item);
  }
  return [...merged.values()]
    .slice(0, 1000)
    .sort((a, b) => b.savedAt - a.savedAt);
}
