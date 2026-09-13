import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { rarity } from "../shared/rarity";
import { discover, blankJournal, achievements } from "../src/discoveries";
import type { Pony } from "../shared/types";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1kAAAAASUVORK5CYII=",
  "base64",
);
const p: Pony = {
  id: 123,
  image: "/api/image/123",
  preview: "/api/image/123?size=preview",
  width: 1000,
  height: 1000,
  tags: ["safe", "fluttershy"],
  artists: ["artist:test"],
  score: 0,
  sourceUrl: "https://derpibooru.org/images/123",
};
test("rarity boundaries, real Harmony requirements and discovery counters", () => {
  for (const [score, tier] of [
    [0, "Common"],
    [80, "Uncommon"],
    [250, "Rare"],
    [600, "Epic"],
    [1200, "Legendary"],
  ] as const)
    assert.equal(rarity({ ...p, score }), tier);
  assert.equal(
    rarity({
      ...p,
      score: 1600,
      favorites: 1100,
      wilsonScore: 0.99,
      featured: false,
    }),
    "Legendary",
  );
  assert.equal(
    rarity({
      ...p,
      score: 1600,
      favorites: 1100,
      wilsonScore: 0.99,
      featured: true,
    }),
    "Harmony",
  );
  assert.equal(
    rarity({ ...p, score: 1600, favorites: 1100, featured: true }),
    "Legendary",
  );
  let j = discover(blankJournal(), p);
  j = discover(j, { ...p, id: 124 });
  assert.equal(j.streak, 2);
  j = discover(j, p);
  assert.equal(j.streak, 0);
  assert.equal(j.totalRolls, 3);
  assert.equal(j.items.length, 2);
  assert.equal(j.items[0]?.count, 2);
  assert.deepEqual(achievements(j, []), ["First Roll"]);
});
const filters = [
  {
    id: 100073,
    name: "Default",
    description: "Live fixture",
    system: true,
    public: false,
    hidden_tag_ids: [10],
    spoilered_tag_ids: [20],
    hidden_complex: "score.lte:-50",
    spoilered_complex: "spoiler:test",
  },
  {
    id: 56027,
    name: "Everything",
    description: "No native filtering",
    system: true,
    public: false,
    hidden_tag_ids: [],
    spoilered_tag_ids: [],
    hidden_complex: null,
    spoilered_complex: null,
  },
];
test("V2 native filter forwarding, allowlist, metadata, cache and safe fallback", async () => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  let offline = false,
    nativeOnly = false,
    filterCalls = 0;
  let last: URL | undefined;
  const make = () =>
    new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0]!.text,
        compatibilityDate: "2026-09-01",
        r2Buckets: ["PONY_IMAGES"],
        bindings: {
          DERPIBOORU_BASE_URL: "https://derpibooru.org",
          REQUEST_TIMEOUT_MS: "1000",
          REQUEST_RETRIES: "0",
          MAX_IMAGE_SIZE_MB: "1",
          CACHE_TTL_DAYS: "30",
          EDGE_CACHE_SECONDS: "0",
        },
        ratelimits: Object.fromEntries(
          ["RANDOM_LIMITER", "IMAGE_LIMITER", "HEALTH_LIMITER"].map((k, i) => [
            k,
            {
              namespace_id: String(2000 + i),
              simple: { limit: 100, period: 60 },
            },
          ]),
        ),
        outboundService: async (req) => {
          const u = new URL(req.url);
          if (u.hostname === "derpicdn.net")
            return new MFResponse(png, {
              headers: { "Content-Type": "image/png" },
            });
          if (u.pathname.endsWith("/filters/system")) {
            filterCalls++;
            return offline
              ? new MFResponse("offline", { status: 503 })
              : MFResponse.json({ filters });
          }
          last = u;
          const image = {
            id: 123,
            width: 800,
            height: 600,
            score: 700,
            tags: nativeOnly
              ? ["explicit", "fluttershy"]
              : ["safe", "fluttershy"],
            spoilered: true,
            wilson_score: 0.98,
            faves: 500,
            representations: { full: "https://derpicdn.net/123.png" },
          };
          return MFResponse.json({
            images: u.searchParams.get("q")?.includes("id:999") ? [] : [image],
          });
        },
      }),
    );
  let mf = make();
  try {
    const get = (path: string) => mf.dispatchFetch("https://pony.test" + path);
    const catalog = (await (await get("/api/filters")).json()) as {
      filters: unknown[];
    };
    assert.equal(catalog.filters.length, 2);
    const r = await get("/api/random?filter=56027&character=fluttershy");
    assert.equal(r.status, 200);
    const result = (await r.json()) as Pony;
    assert.equal(result.spoilered, true);
    assert.equal(result.wilsonScore, 0.98);
    assert.equal(last?.searchParams.get("filter_id"), "56027");
    assert.match(last?.searchParams.get("q") ?? "", /safe.*fluttershy/);
    nativeOnly = true;
    const native = await get(
      "/api/random?filter=100073&character=fluttershy&strict=0",
    );
    assert.equal(native.status, 200);
    const nativeBody = (await native.json()) as Pony;
    assert.equal(nativeBody.strictSafe, false);
    assert.doesNotMatch(
      last?.searchParams.get("q") ?? "",
      /(?:^|,)safe(?:,|$)/,
    );
    const nativeImage = await get("/api/image/123?filter=100073&strict=0");
    assert.equal(nativeImage.status, 200);
    assert.equal(nativeImage.headers.get("content-type"), "image/png");
    nativeOnly = false;
    assert.equal((await get("/api/random?filter=99999")).status, 400);
    assert.equal(
      (await get("/api/random?tag=safe%20OR%20explicit")).status,
      400,
    );
    assert.equal((await get("/api/metadata/123?filter=100073")).status, 200);
    assert.match(last?.searchParams.get("q") ?? "", /id:123/);
    assert.equal((await get("/api/metadata/999?filter=100073")).status, 404);
    offline = true;
    await get("/api/filters");
    assert.equal(filterCalls, 1, "fresh catalog avoids upstream calls");
    await mf.dispose();
    mf = make();
    const bucket = await mf.getR2Bucket("PONY_IMAGES");
    await bucket.put(
      "metadata/system-filters-v2.json",
      JSON.stringify({ filters, fetchedAt: Date.now() - 86400000 }),
    );
    const stale = (await (await get("/api/filters")).json()) as {
      source: string;
    };
    assert.equal(stale.source, "stale");
    await mf.dispose();
    mf = make();
    const fallback = (await (await get("/api/filters")).json()) as {
      source: string;
      defaultId: number;
    };
    assert.equal(fallback.source, "fallback");
    assert.equal(fallback.defaultId, 0);
    const n = filterCalls;
    await get("/api/filters");
    assert.equal(filterCalls, n, "failure has a five-minute retry backoff");
    assert.equal((await get("/api/random?filter=0")).status, 200);
  } finally {
    await mf.dispose();
  }
});
