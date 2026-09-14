import { z } from "zod";
import { characters, type Character } from "../../shared/types";
import { publicPony } from "../../shared/safety";
import { rollTags } from "../../shared/search-tags";
import type { Env } from "../types";
import { resolveFilter } from "../services/filters";
import { searchWithFailover } from "../services/providers";
import { contentFields, contentSettings } from "./params";

export async function randomRoute(url: URL, env: Env) {
  const params = z
    .object({
      character: z
        .enum(Object.keys(characters) as [Character, ...Character[]])
        .default("all"),
      mode: z.enum(["random", "top", "featured", "surprise"]).default("random"),
      filter: z
        .string()
        .regex(/^(0|[1-9]\d{0,9})$/)
        .optional(),
      tag: z
        .string()
        .refine((tag) => rollTags.includes(tag))
        .optional(),
      exclude: z
        .string()
        .regex(/^(?:(?:derpibooru|twibooru):)?[1-9]\d{0,9}$/)
        .optional(),
      ...contentFields,
    })
    .strict()
    .parse(Object.fromEntries(url.searchParams));
  const filter = await resolveFilter(
    env,
    params.filter === undefined ? undefined : Number(params.filter),
  );
  const content = contentSettings(params);
  const excludeCanonicalId = params.exclude
    ? params.exclude.includes(":")
      ? params.exclude
      : `derpibooru:${params.exclude}`
    : undefined;
  const image = await searchWithFailover(env, {
    character: params.character,
    mode: params.mode,
    content,
    filterId: filter.id,
    tag: params.tag,
    excludeCanonicalId,
  });
  return Response.json(publicPony(image, content, filter.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
