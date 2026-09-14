import type { NormalizedImage } from "../../shared/types";
import { validImage, imageMimes } from "../../shared/image-format";
import { POLICY_VERSION } from "../../shared/policy";
import type { Env } from "../types";
import { settings } from "../config";
import { downloadImage } from "./derpibooru";
import { ServiceError } from "./errors";

export { POLICY_VERSION } from "../../shared/policy";

export function imageKey(
  image: Pick<NormalizedImage, "provider" | "providerId">,
  preview: boolean | "saver" | "original",
) {
  return `images/${POLICY_VERSION}/${image.provider}/${image.providerId}/${typeof preview === "string" ? preview : preview ? "preview" : "full"}`;
}

function validCached(object: R2Object, env: Env, image: NormalizedImage) {
  return (
    object.customMetadata?.policy === POLICY_VERSION &&
    object.customMetadata?.provider === image.provider &&
    object.customMetadata?.imageId === String(image.providerId) &&
    Date.now() - Number(object.customMetadata?.cachedAt) < settings(env).ttl &&
    imageMimes.some((mime) => mime === object.httpMetadata?.contentType)
  );
}

function representation(
  image: NormalizedImage,
  preview: boolean | "saver" | "original",
) {
  return preview === "original"
    ? image.representations.full
    : preview === "saver"
      ? (image.representations.medium ??
        image.representations.large ??
        image.representations.full)
      : preview
        ? (image.representations.thumb ??
          image.representations.small ??
          image.representations.medium ??
          image.representations.full)
        : (image.representations.large ?? image.representations.full);
}

async function byteEtag(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `"${Array.from(digest.subarray(0, 16), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}"`;
}

export async function cachedImage(
  env: Env,
  preview: boolean | "saver" | "original",
  image: NormalizedImage,
) {
  const key = imageKey(image, preview);
  const bucket = env.PONY_IMAGES;
  if (bucket) {
    const object = await bucket.get(key);
    if (object && validCached(object, env, image))
      return {
        body: object.body,
        mime: object.httpMetadata!.contentType!,
        size: object.size,
        etag: object.httpEtag,
        hit: "R2-HIT" as const,
      };
    if (object) {
      await object.body.cancel();
      await bucket.delete(key);
    }
  }
  const url = representation(image, preview);
  if (!url) throw new ServiceError("Image representation unavailable", 404);
  const { bytes, mime } = await downloadImage(env, image.provider, url);
  if (!validImage(bytes, mime))
    throw new ServiceError("Unsupported or invalid image", 415);
  const etag = await byteEtag(bytes);
  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: mime,
        cacheControl: "public, max-age=86400",
      },
      customMetadata: {
        policy: POLICY_VERSION,
        provider: image.provider,
        imageId: String(image.providerId),
        cachedAt: String(Date.now()),
      },
    });
  }
  return {
    body: bytes,
    mime,
    size: bytes.byteLength,
    etag,
    hit: "MISS" as const,
  };
}
