import { z } from "zod";
import { characters, type Character } from "../../shared/types";
import { publicPony } from "../../shared/safety";
import {
  rememberFilteredImage,
  searchRandomImage,
} from "../services/derpibooru";
import type { Env } from "../types";
import { resolveFilter } from "../services/filters";
import { rollTags } from "../../shared/search-tags";
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
      strict: z.enum(["0", "1"]).default("1"),
      tag: z
        .string()
        .refine((t) => rollTags.includes(t))
        .optional(),
      exclude: z
        .string()
        .regex(/^[1-9]\d{0,9}$/)
        .optional(),
    })
    .strict()
    .parse(Object.fromEntries(url.searchParams));
  const filter = await resolveFilter(
    env,
    params.filter === undefined ? undefined : Number(params.filter),
  );
  // A fallback catalog has no verified native filter to defer to, so it stays safe.
  const strictSafe = filter.id === 0 || params.strict === "1";
  const image = await searchRandomImage(
    env,
    params.character,
    params.mode,
    params.exclude ? Number(params.exclude) : undefined,
    filter.id,
    params.tag,
    strictSafe,
  );
  await rememberFilteredImage(image, filter.id, strictSafe);
  return Response.json(publicPony(image, filter.id, strictSafe), {
    headers: { "Cache-Control": "no-store" },
  });
}
