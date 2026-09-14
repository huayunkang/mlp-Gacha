import type {
  ContentSettings,
  NormalizedImage,
  Pony,
  ProviderId,
} from "./types";

function imageURL(
  image: NormalizedImage,
  content: ContentSettings,
  filterId: number,
  size?: "preview",
) {
  const params = new URLSearchParams({
    content: content.contentLevel,
    adultMode: content.adultMode,
    graphic: content.graphicLevel,
    filter: String(filterId),
  });
  if (size) params.set("size", size);
  return `/api/image/${image.provider}/${image.providerId}?${params}`;
}

export function publicPony(
  image: NormalizedImage,
  content: ContentSettings,
  filterId: number,
): Pony {
  const { representations: _representations, ...metadata } = image;
  return {
    ...metadata,
    id: image.providerId,
    image: imageURL(image, content, filterId),
    preview: imageURL(image, content, filterId, "preview"),
    filterId,
    contentLevel: content.contentLevel,
    adultMode: content.adultMode,
    selectedGraphicLevel: content.graphicLevel,
  };
}

const mediaHosts: Record<ProviderId, readonly string[]> = {
  derpibooru: ["derpicdn.net", "derpibooru.org"],
  trixiebooru: ["derpicdn.net", "trixiebooru.org"],
  twibooru: ["cdn.twibooru.org", "twibooru.org"],
};

export function mediaUrl(provider: ProviderId, value: string) {
  const url = new URL(value);
  const allowed = mediaHosts[provider];
  if (
    url.protocol !== "https:" ||
    !allowed.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    ) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Rejected upstream image host");
  return url;
}
