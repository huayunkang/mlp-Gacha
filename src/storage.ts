import { normalizeGraphicLevel, normalizeRating } from "../shared/content";
import type {
  ContentLevel,
  GraphicLevel,
  Pony,
  ProviderId,
  Rating,
  SavedPony,
} from "../shared/types";

const providerIds = ["derpibooru", "trixiebooru", "twibooru"] as const;
const ratings = [
  "safe",
  "suggestive",
  "questionable",
  "explicit",
  "unknown",
] as const;
const graphicLevels = ["clean", "dark", "graphic", "unknown"] as const;

function includes<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function migrateSavedPony(value: unknown): SavedPony | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<SavedPony>;
  if (
    !Number.isSafeInteger(raw.id) ||
    Number(raw.id) <= 0 ||
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    !Number.isFinite(raw.score) ||
    !Array.isArray(raw.tags) ||
    !raw.tags.every((tag) => typeof tag === "string") ||
    !Array.isArray(raw.artists) ||
    !raw.artists.every((artist) => typeof artist === "string") ||
    !Number.isFinite(raw.savedAt)
  )
    return undefined;
  const id = Number(raw.id);
  const provider: ProviderId = includes(providerIds, raw.provider)
    ? raw.provider
    : "derpibooru";
  const rating: Rating = includes(ratings, raw.rating)
    ? raw.rating
    : normalizeRating(provider, raw.tags);
  const graphicLevel = includes(graphicLevels, raw.graphicLevel)
    ? raw.graphicLevel
    : normalizeGraphicLevel(provider, raw.tags);
  const contentLevel: ContentLevel =
    raw.contentLevel === "teen" || raw.contentLevel === "adult"
      ? raw.contentLevel
      : rating === "suggestive"
        ? "teen"
        : rating === "questionable" || rating === "explicit"
          ? "adult"
          : "safe";
  const selectedGraphicLevel: GraphicLevel =
    raw.selectedGraphicLevel === "dark" ||
    raw.selectedGraphicLevel === "graphic"
      ? raw.selectedGraphicLevel
      : "clean";
  const oldPage =
    typeof raw.pageUrl === "string"
      ? raw.pageUrl
      : typeof raw.sourceUrl === "string" && raw.sourceUrl.includes("booru.org")
        ? raw.sourceUrl
        : `https://derpibooru.org/images/${id}`;
  return {
    ...raw,
    id,
    provider,
    providerId: Number.isSafeInteger(raw.providerId) ? raw.providerId! : id,
    canonicalId:
      typeof raw.canonicalId === "string"
        ? raw.canonicalId
        : `derpibooru:${id}`,
    width: Number(raw.width),
    height: Number(raw.height),
    format: raw.format ?? "",
    score: Number(raw.score),
    tags: raw.tags,
    artists: raw.artists,
    pageUrl: oldPage,
    rating,
    graphicLevel,
    spoilered: raw.spoilered ?? true,
    featured: raw.featured ?? raw.tags.includes("featured image"),
    image: typeof raw.image === "string" ? raw.image : "",
    preview: typeof raw.preview === "string" ? raw.preview : "",
    contentLevel,
    adultMode:
      raw.adultMode === "questionable" || raw.adultMode === "explicit"
        ? raw.adultMode
        : "all",
    selectedGraphicLevel,
    savedAt: Number(raw.savedAt),
    viewedAt: Number.isFinite(raw.viewedAt)
      ? raw.viewedAt
      : Number(raw.savedAt),
  };
}

export function readList(key: string): SavedPony[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((item) => {
        const migrated = migrateSavedPony(item);
        return migrated ? [migrated] : [];
      })
      .slice(0, key === "pony-history" ? 50 : 1000);
  } catch {
    return [];
  }
}

export function saveList(key: string, list: SavedPony[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addHistory(pony: Pony) {
  const now = Date.now();
  const list = [
    { ...pony, savedAt: now, viewedAt: now },
    ...readList("pony-history").filter(
      (item) => item.canonicalId !== pony.canonicalId,
    ),
  ].slice(0, 50);
  return saveList("pony-history", list);
}
