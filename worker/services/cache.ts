import type { Env } from "../types";
import { settings } from "../config";
import { downloadImage, ServiceError } from "./derpibooru";
import type { UpstreamImage } from "../../shared/safety";
import { validImage, imageMimes } from "../../shared/image-format";
import { POLICY_VERSION } from "../../shared/policy";
export { POLICY_VERSION } from "../../shared/policy";
export function imageKey(id: number, preview: boolean | "saver" | "original") {
  return `images/${POLICY_VERSION}/${id}/${typeof preview === "string" ? preview : preview ? "preview" : "full"}`;
}
function validCached(object: R2Object, env: Env, id: number) {
  return (
    object.customMetadata?.policy === POLICY_VERSION &&
    object.customMetadata?.imageId === String(id) &&
    Date.now() - Number(object.customMetadata?.cachedAt) < settings(env).ttl &&
    imageMimes.some((m) => m === object.httpMetadata?.contentType)
  );
}
export async function cachedImage(
  env: Env,
  id: number,
  preview: boolean | "saver" | "original",
  image: UpstreamImage,
) {
  const key = imageKey(id, preview);
  const object = await env.PONY_IMAGES.get(key);
  if (object && validCached(object, env, id)) return { object, hit: true };
  if (object) {
    await object.body.cancel();
    await env.PONY_IMAGES.delete(key);
  }
  const url =
    preview === "original"
      ? image.representations.full
      : preview === "saver"
        ? (image.representations.medium ??
          image.representations.large ??
          image.representations.full)
        : preview
          ? (image.representations.thumb ??
            image.representations.medium ??
            image.representations.full)
          : (image.representations.large ?? image.representations.full);
  const { bytes, mime } = await downloadImage(env, url);
  if (!validImage(bytes, mime))
    throw new ServiceError("Unsupported or invalid image", 415);
  await env.PONY_IMAGES.put(key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: "public, max-age=86400" },
    customMetadata: {
      policy: POLICY_VERSION,
      imageId: String(id),
      cachedAt: String(Date.now()),
    },
  });
  const saved = await env.PONY_IMAGES.get(key);
  if (!saved) throw new ServiceError("R2 write could not be read");
  return { object: saved, hit: false };
}
