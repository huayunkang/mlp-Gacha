import type { Pony } from "../shared/types";
import { rarity, rarities } from "../shared/rarity";
import { characters } from "../shared/types";
import { migrateSavedPony } from "./storage";
export interface Discovery extends Pony {
  count: number;
  firstSeen: number;
  lastSeen: number;
}
export interface Journal {
  items: Discovery[];
  totalRolls: number;
  streak: number;
  achievements: string[];
}
export const blankJournal = (): Journal => ({
  items: [],
  totalRolls: 0,
  streak: 0,
  achievements: [],
});
export function discover(j: Journal, p: Pony) {
  const old = j.items.find((item) => item.canonicalId === p.canonicalId);
  return {
    ...j,
    totalRolls: j.totalRolls + 1,
    streak: old ? 0 : j.streak + 1,
    items: [
      {
        ...p,
        count: (old?.count ?? 0) + 1,
        firstSeen: old?.firstSeen ?? Date.now(),
        lastSeen: Date.now(),
      },
      ...j.items.filter((item) => item.canonicalId !== p.canonicalId),
    ],
  };
}
export function achievements(j: Journal, favorites: Pony[]) {
  return [
    j.totalRolls >= 1 ? "First Roll" : "",
    favorites.length >= 10 ? "New Collector" : "",
    Object.values(characters)
      .slice(1, 7)
      .every((name) => j.items.some((p) => p.tags.includes(name.toLowerCase())))
      ? "Mane Six"
      : "",
    j.items.some((p) => rarities.indexOf(rarity(p)) >= 4) ? "Lucky Pony" : "",
    j.items.some((p) => rarity(p) === "Harmony") ? "Harmony" : "",
    j.items.length >= 100 ? "Explorer" : "",
  ].filter(Boolean);
}
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("pony-roulette-v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("metadata");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("Local database blocked"));
  });
}
export async function readJournal(): Promise<Journal> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("metadata");
    const r = tx.objectStore("metadata").get("journal");
    r.onsuccess = () => {
      const j = r.result;
      if (!j || !Array.isArray(j.items) || !Number.isFinite(j.totalRolls)) {
        resolve(blankJournal());
        return;
      }
      const items = j.items.flatMap((item: Discovery) => {
        if (
          !Number.isFinite(item.count) ||
          item.count < 0 ||
          !Number.isFinite(item.firstSeen) ||
          !Number.isFinite(item.lastSeen)
        )
          return [];
        const migrated = migrateSavedPony({
          ...item,
          savedAt: item.lastSeen,
        });
        return migrated
          ? [
              {
                ...migrated,
                count: item.count,
                firstSeen: item.firstSeen,
                lastSeen: item.lastSeen,
              },
            ]
          : [];
      });
      resolve({
        items,
        totalRolls: Math.max(0, j.totalRolls),
        streak: Number.isFinite(j.streak) ? Math.max(0, j.streak) : 0,
        achievements: Array.isArray(j.achievements)
          ? j.achievements.filter((a: unknown) => typeof a === "string")
          : [],
      });
    };
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => d.close();
    tx.onabort = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export async function writeJournal(j: Journal) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("metadata", "readwrite");
    tx.objectStore("metadata").put(j, "journal");
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => {
      d.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export function preference<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function storePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
