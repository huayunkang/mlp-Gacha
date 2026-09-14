import type {
  AdultMode,
  Character,
  ContentLevel,
  ContentSettings,
  GraphicLevel,
  Mode,
  NormalizedGraphicLevel,
  NormalizedImage,
  ProviderId,
  Rating,
} from "./types";
import { characters } from "./types";

export const defaultContentSettings: ContentSettings = {
  contentLevel: "safe",
  adultMode: "all",
  graphicLevel: "clean",
};

const ratingTags: Record<ProviderId, readonly string[]> = {
  derpibooru: ["safe", "suggestive", "questionable", "explicit"],
  trixiebooru: ["safe", "suggestive", "questionable", "explicit"],
  twibooru: ["safe", "suggestive", "questionable", "explicit"],
};

const graphicTags: Record<
  ProviderId,
  { dark: readonly string[]; graphic: readonly string[] }
> = {
  derpibooru: {
    dark: ["semi-grimdark", "grimdark"],
    graphic: ["gore", "grotesque"],
  },
  trixiebooru: {
    dark: ["semi-grimdark", "grimdark"],
    graphic: ["gore", "grotesque"],
  },
  twibooru: {
    dark: ["semi-grimdark", "grimdark"],
    graphic: ["gore", "grotesque"],
  },
};

export function normalizeRating(provider: ProviderId, tags: string[]): Rating {
  const found = ratingTags[provider].filter((tag) => tags.includes(tag));
  return found.length === 1 ? (found[0] as Rating) : "unknown";
}

export function normalizeGraphicLevel(
  provider: ProviderId,
  tags: string[],
): NormalizedGraphicLevel {
  const map = graphicTags[provider];
  if (map.graphic.some((tag) => tags.includes(tag))) return "graphic";
  if (map.dark.some((tag) => tags.includes(tag))) return "dark";
  return "clean";
}

export function buildSexualQuery(
  contentLevel: ContentLevel,
  adultMode: AdultMode,
) {
  if (contentLevel === "safe")
    return ["safe", "-suggestive", "-questionable", "-explicit"];
  if (contentLevel === "teen")
    return ["suggestive", "-safe", "-questionable", "-explicit"];
  if (adultMode === "questionable")
    return ["questionable", "-safe", "-suggestive", "-explicit"];
  if (adultMode === "explicit")
    return ["explicit", "-safe", "-suggestive", "-questionable"];
  return ["(questionable OR explicit)", "-safe", "-suggestive"];
}

export function buildGraphicQuery(graphicLevel: GraphicLevel) {
  if (graphicLevel === "clean")
    return ["-semi-grimdark", "-grimdark", "-gore", "-grotesque"];
  if (graphicLevel === "dark") return ["-gore", "-grotesque"];
  return [];
}

export function contentAllows(
  image: NormalizedImage,
  content: ContentSettings,
) {
  const ratingAllowed =
    content.contentLevel === "safe"
      ? image.rating === "safe"
      : content.contentLevel === "teen"
        ? image.rating === "suggestive"
        : content.adultMode === "questionable"
          ? image.rating === "questionable"
          : content.adultMode === "explicit"
            ? image.rating === "explicit"
            : image.rating === "questionable" || image.rating === "explicit";
  const graphicAllowed =
    image.graphicLevel !== "unknown" &&
    (content.graphicLevel === "graphic" ||
      image.graphicLevel === "clean" ||
      (content.graphicLevel === "dark" && image.graphicLevel === "dark"));
  return ratingAllowed && graphicAllowed;
}

export function buildFinalQuery(options: {
  content: ContentSettings;
  character: Character;
  mode: Mode;
  tag?: string;
}) {
  return [
    ...buildSexualQuery(
      options.content.contentLevel,
      options.content.adultMode,
    ),
    ...buildGraphicQuery(options.content.graphicLevel),
    "(mime_type:image/jpeg OR mime_type:image/png OR mime_type:image/webp OR mime_type:image/gif)",
    ...(options.character === "all"
      ? []
      : [characters[options.character].toLowerCase()]),
    ...(options.mode === "top"
      ? ["score.gt:100"]
      : options.mode === "featured"
        ? ["featured image"]
        : []),
    ...(options.tag ? [options.tag] : []),
  ].join(",");
}
