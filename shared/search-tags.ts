import { characters } from "./types";
// Deliberately small exact-match vocabulary; never accept query syntax.
export const rollTags = [
  ...Object.values(characters)
    .slice(1)
    .map((n) => n.toLowerCase()),
  "solo",
  "smiling",
  "scenery",
  "cute",
  "unicorn",
  "pegasus",
  "earth pony",
  "alicorn",
];
export function tagCategory(tag: string) {
  if (tag.startsWith("artist:")) return "artist";
  if (Object.values(characters).some((n) => n.toLowerCase() === tag))
    return "character";
  if (["unicorn", "pegasus", "earth pony", "alicorn"].includes(tag))
    return "species";
  if (
    [
      "safe",
      "suggestive",
      "questionable",
      "explicit",
      "grimdark",
      "grotesque",
      "semi-grimdark",
    ].includes(tag)
  )
    return "rating";
  if (tag.startsWith("spoiler:")) return "spoiler";
  return "general";
}
