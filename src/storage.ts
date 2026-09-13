import type { Pony, SavedPony } from "../shared/types";
export function readList(key: string): SavedPony[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (p): p is SavedPony =>
          p &&
          Number.isSafeInteger(p.id) &&
          p.id > 0 &&
          Number.isFinite(p.width) &&
          Number.isFinite(p.height) &&
          Number.isFinite(p.score) &&
          Array.isArray(p.tags) &&
          p.tags.every((t: unknown) => typeof t === "string") &&
          Array.isArray(p.artists) &&
          p.artists.every((t: unknown) => typeof t === "string") &&
          typeof p.savedAt === "number",
      )
      .slice(0, key === "pony-history" ? 50 : 1000)
      .map((p) => ({
        ...p,
        image: p.image,
        preview: p.preview,
        sourceUrl: `https://derpibooru.org/images/${p.id}`,
      }));
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
  const list = [
    { ...pony, savedAt: Date.now() },
    ...readList("pony-history").filter((p) => p.id !== pony.id),
  ].slice(0, 50);
  return saveList("pony-history", list);
}
