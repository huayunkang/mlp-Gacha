import type { Pony } from "./types";
export const rarities = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Harmony",
] as const;
export type Rarity = (typeof rarities)[number];
export const rarityNames = ["普通", "优秀", "稀有", "史诗", "传奇", "和谐之光"];
// Visual discovery score, calculated AFTER sampling. Never used in a search query.
export function rarity(p: Pony): Rarity {
  const score = Math.max(0, p.score);
  const points =
    score +
    Math.min(500, Math.max(0, p.favorites ?? 0) * 0.25) +
    (Math.min(p.width, p.height) >= 2000 ? 25 : 0);
  if (
    p.featured &&
    score >= 1500 &&
    (p.wilsonScore ?? 0) >= 0.98 &&
    (p.favorites ?? 0) >= 1000
  )
    return "Harmony";
  if (points >= 1200) return "Legendary";
  if (points >= 600) return "Epic";
  if (points >= 250) return "Rare";
  if (points >= 80) return "Uncommon";
  return "Common";
}
export function rarityLabel(p: Pony) {
  const r = rarity(p);
  return `${r === "Harmony" ? "🌈" : "★".repeat(rarities.indexOf(r) + 1)} ${r} · ${rarityNames[rarities.indexOf(r)]}`;
}
