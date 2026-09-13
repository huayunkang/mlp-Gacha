import { z } from "zod";
import type { Env } from "../types";
import { safeFilter, type FilterCatalog } from "../../shared/filters";
import { json, ServiceError } from "./derpibooru";
const schema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(20000),
  system: z.boolean(),
  public: z.boolean(),
  hidden_tag_ids: z.array(z.number().int().positive()).max(10000),
  spoilered_tag_ids: z.array(z.number().int().positive()).max(10000),
  hidden_complex: z.string().max(20000).nullable(),
  spoilered_complex: z.string().max(20000).nullable(),
});
const key = "metadata/system-filters-v2.json";
const ttl = 6 * 60 * 60 * 1000;
const edgeKey = new Request("https://pony.internal/filters-v2");
function validate(value: unknown): FilterCatalog {
  if (
    value &&
    typeof value === "object" &&
    "source" in value &&
    value.source === "fallback"
  )
    return {
      filters: [safeFilter],
      defaultId: 0,
      fetchedAt: 0,
      source: "fallback",
    };
  const p = z
    .object({ filters: z.array(schema).min(1).max(100), fetchedAt: z.number() })
    .parse(value);
  const filters = p.filters.filter((f) => f.system || f.public);
  if (!filters.length) throw new Error("Empty public filters");
  return {
    ...p,
    filters,
    defaultId: filters.find((f) => f.name.toLowerCase() === "default")?.id ?? 0,
    source: "cache",
  };
}
export async function getFilters(env: Env): Promise<FilterCatalog> {
  let stale: FilterCatalog | undefined;
  try {
    const hit = await caches.default.match(edgeKey);
    if (hit) {
      const raw = (await hit.json()) as FilterCatalog;
      const valid = validate(raw);
      return {
        ...valid,
        source: raw.source === "stale" ? "stale" : valid.source,
      };
    }
    const object = await env.PONY_IMAGES.get(key);
    if (object) stale = validate(await object.json());
    if (stale && Date.now() - stale.fetchedAt < ttl) {
      await caches.default
        .put(
          edgeKey,
          Response.json(stale, {
            headers: {
              "Cache-Control": `public, max-age=${Math.max(1, Math.floor((ttl - Date.now() + stale.fetchedAt) / 1000))}`,
            },
          }),
        )
        .catch(() => {});
      return stale;
    }
  } catch {
    /* Cache failures must not prevent safe discovery. */
  }
  try {
    const result = await json(env, "filters/system");
    const catalog = validate({ ...result, fetchedAt: Date.now() });
    catalog.source = "live";
    const body = JSON.stringify(catalog);
    await Promise.allSettled([
      env.PONY_IMAGES.put(key, body, {
        httpMetadata: { contentType: "application/json" },
      }),
      caches.default.put(
        edgeKey,
        new Response(body, {
          headers: { "Cache-Control": "public, max-age=21600" },
        }),
      ),
    ]);
    return catalog;
  } catch {
    const fallback: FilterCatalog = stale
      ? { ...stale, source: "stale" }
      : {
          filters: [safeFilter],
          defaultId: 0,
          fetchedAt: 0,
          source: "fallback",
        };
    await caches.default
      .put(
        edgeKey,
        Response.json(fallback, {
          headers: { "Cache-Control": "public, max-age=300" },
        }),
      )
      .catch(() => {});
    return fallback;
  }
}
export async function resolveFilter(env: Env, id?: number) {
  const catalog = await getFilters(env);
  if (id === 0 || (id === undefined && catalog.defaultId === 0))
    return safeFilter;
  const filter = catalog.filters.find(
    (f) => f.id === (id ?? catalog.defaultId),
  );
  if (!filter)
    throw new ServiceError("Filter is not in the public allowlist", 400);
  return filter;
}
