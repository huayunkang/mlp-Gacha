import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  Miniflare as NativeMiniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
  type V4MiniflareOptions,
} from "miniflare";
class Miniflare extends NativeMiniflare {
  constructor(options: V4MiniflareOptions) {
    super(convertV4MiniflareOptions(options));
  }
}
import { query, cdnUrl, safeImage, imageSchema } from "../shared/safety.js";
import { validImage } from "../shared/image-format.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1kAAAAASUVORK5CYII=",
  "base64",
);
const formats = [
  { mime: "image/png", bytes: png },
  {
    mime: "image/jpeg",
    bytes: Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]),
  },
  { mime: "image/webp", bytes: Buffer.from("RIFF0000WEBPVP8 ") },
  { mime: "image/gif", bytes: Buffer.from("GIF89a123456789") },
];
const fixture = (
  id = 123,
  tags = ["safe", "fluttershy", "featured image"],
) => ({
  id,
  width: 800,
  height: 600,
  tags,
  score: 200,
  representations: {
    full: `https://derpicdn.net/img/${id}.png`,
    large: `https://derpicdn.net/img/${id}.png`,
    thumb: `https://derpicdn.net/img/${id}-thumb.png`,
  },
});
test("safe policy and SSRF validation", () => {
  assert.match(
    query("fluttershy", "top"),
    /safe.*-explicit.*fluttershy.*score.gt:100/,
  );
  for (const tags of [
    ["explicit"],
    ["safe", "suggestive"],
    ["safe", "seizure warning"],
    ["safe", "fetish"],
    ["safe", "bondage"],
  ])
    assert.equal(safeImage(imageSchema.parse(fixture(1, tags))), false);
  for (const url of [
    "http://derpicdn.net/a",
    "https://derpicdn.net.evil.test/a",
    "https://127.0.0.1/a",
    "https://user@derpicdn.net/a",
    "https://derpicdn.net:4430/a",
  ])
    assert.throws(() => cdnUrl(url));
  assert.equal(cdnUrl("https://derpicdn.net/img/a").hostname, "derpicdn.net");
  for (const f of formats) assert.equal(validImage(f.bytes, f.mime), true);
  assert.equal(validImage(Buffer.from("<html>"), "image/png"), false);
});
test("real workerd + local R2: routes, caching, safety, outage, limits", async (t) => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  let offline = false;
  let unsafe = false;
  let format = formats[0]!;
  let calls = 0;
  let oversized = false;
  let redirect = false;
  let retries = 0;
  const mf = new Miniflare({
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
    ratelimits: {
      RANDOM_LIMITER: {
        namespace_id: "1001",
        simple: { limit: 60, period: 60 },
      },
      IMAGE_LIMITER: {
        namespace_id: "1002",
        simple: { limit: 240, period: 60 },
      },
      HEALTH_LIMITER: {
        namespace_id: "1003",
        simple: { limit: 12, period: 60 },
      },
    },
    outboundService: async (req) => {
      calls++;
      if (offline) {
        retries++;
        return new MFResponse("offline", { status: 503 });
      }
      const url = new URL(req.url);
      if (url.hostname === "derpibooru.org") {
        if (url.pathname.endsWith("/filters/system"))
          return MFResponse.json({
            filters: [
              {
                id: 100073,
                name: "Default",
                description: "Fixture",
                system: true,
                public: false,
                hidden_tag_ids: [1],
                spoilered_tag_ids: [2],
                hidden_complex: null,
                spoilered_complex: null,
              },
            ],
          });
        if (url.pathname.includes("search")) {
          assert.match(url.searchParams.get("q") ?? "", /safe/);
          const requested = /(?:^|,)id:(\d+)/.exec(
            url.searchParams.get("q") ?? "",
          )?.[1];
          return MFResponse.json({
            images: [
              fixture(
                requested ? Number(requested) : 123,
                unsafe ? ["safe", "explicit"] : undefined,
              ),
            ],
            total: 1,
          });
        }
        const id = Number(url.pathname.split("/").pop());
        return MFResponse.json({
          image: fixture(id, unsafe ? ["safe", "questionable"] : undefined),
        });
      }
      assert.equal(url.hostname, "derpicdn.net");
      if (redirect)
        return new MFResponse(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/private" },
        });
      return new MFResponse(
        oversized ? new Uint8Array(1024 ** 2 + 1) : format.bytes,
        { headers: { "Content-Type": format.mime } },
      );
    },
  });
  try {
    await t.test(
      "random response only exposes local media URLs and no-store",
      async () => {
        const r = await mf.dispatchFetch(
          "https://pony.test/api/random?character=fluttershy&mode=top",
        );
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("cache-control"), "no-store");
        const body = (await r.json()) as { image: string; preview: string };
        assert.equal(body.image, "/api/image/123?filter=100073&strict=1");
        assert.equal(
          body.preview,
          "/api/image/123?filter=100073&strict=1&size=preview",
        );
        assert.doesNotMatch(JSON.stringify(body), /derpicdn/);
      },
    );
    await t.test(
      "invalid and arbitrary query parameters rejected",
      async () => {
        for (const p of [
          "/api/random?q=explicit",
          "/api/random?character=evil",
          "/api/random?mode=unsafe",
          "/api/random?mode=top&mode=random",
          "/api/image/abc",
          "/api/image/123?url=https://evil.test",
          "/api/image/123?size=full",
          "/api/image/123?strict=2",
        ])
          assert.equal(
            (await mf.dispatchFetch("https://pony.test" + p)).status,
            400,
          );
        assert.equal(
          (
            await mf.dispatchFetch("https://pony.test/api/image/123", {
              headers: { "sec-fetch-site": "cross-site" },
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "R2 miss -> save -> hit -> ETag 304; preview separate",
      async () => {
        const first = await mf.dispatchFetch("https://pony.test/api/image/123");
        assert.equal(first.status, 200);
        assert.equal(first.headers.get("x-cache"), "MISS");
        assert.deepEqual(Buffer.from(await first.arrayBuffer()), png);
        const n = calls;
        const second = await mf.dispatchFetch(
          "https://pony.test/api/image/123",
        );
        assert.equal(second.headers.get("x-cache"), "R2-HIT");
        assert.equal(calls, n);
        const etag = second.headers.get("etag")!;
        await second.arrayBuffer();
        const unchanged = await mf.dispatchFetch(
          "https://pony.test/api/image/123",
          { headers: { "If-None-Match": etag } },
        );
        assert.equal(unchanged.status, 304);
        const preview = await mf.dispatchFetch(
          "https://pony.test/api/image/123?size=preview",
        );
        assert.equal(preview.headers.get("x-cache"), "MISS");
        await preview.arrayBuffer();
        const bucket = await mf.getR2Bucket("PONY_IMAGES");
        const o = await bucket.head("images/filter-v3/123/full");
        assert.equal(o?.customMetadata?.imageId, "123");
        assert.equal(o?.httpMetadata?.contentType, "image/png");
      },
    );
    await t.test("unsafe direct ID and search result fail closed", async () => {
      unsafe = true;
      assert.equal(
        (await mf.dispatchFetch("https://pony.test/api/image/444")).status,
        404,
      );
      assert.equal(
        (await mf.dispatchFetch("https://pony.test/api/random")).status,
        404,
      );
      unsafe = false;
    });
    await t.test("JPEG PNG WEBP GIF MIME preserved", async () => {
      for (const [i, f] of formats.entries()) {
        format = f;
        const r = await mf.dispatchFetch(
          `https://pony.test/api/image/${200 + i}`,
        );
        assert.equal(r.status, 200);
        assert.equal(r.headers.get("content-type"), f.mime);
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), f.bytes);
      }
      format = formats[0]!;
    });
    await t.test("oversize, spoofed MIME and redirects rejected", async () => {
      oversized = true;
      assert.equal(
        (await mf.dispatchFetch("https://pony.test/api/image/900")).status,
        413,
      );
      oversized = false;
      format = { mime: "image/png", bytes: Buffer.from("<html>no</html>") };
      assert.equal(
        (await mf.dispatchFetch("https://pony.test/api/image/901")).status,
        415,
      );
      format = formats[0]!;
      redirect = true;
      assert.equal(
        (await mf.dispatchFetch("https://pony.test/api/image/902")).status,
        503,
      );
      redirect = false;
    });
    await t.test(
      "outage: cached favorite works, random returns friendly JSON, health degraded",
      async () => {
        offline = true;
        const n = calls;
        const cached = await mf.dispatchFetch(
          "https://pony.test/api/image/123",
        );
        assert.equal(cached.status, 200);
        assert.equal(calls, n);
        await cached.arrayBuffer();
        const random = await mf.dispatchFetch("https://pony.test/api/random");
        assert.equal(random.status, 503);
        assert.match(JSON.stringify(await random.json()), /再试一次/);
        const health = await mf.dispatchFetch("https://pony.test/api/health");
        assert.deepEqual(
          Object.assign({}, await health.json(), { checkedAt: null }),
          {
            status: "degraded",
            derpibooru: "unreachable",
            r2: "ok",
            checkedAt: null,
          },
        );
        assert.equal(retries, 2);
        offline = false;
      },
    );
    await t.test("rate limit blocks excess requests", async () => {
      let limited = false;
      for (let i = 0; i < 65; i++) {
        const r = await mf.dispatchFetch(
          "https://pony.test/api/random?character=invalid",
        );
        if (r.status === 429) {
          assert.equal(r.headers.get("retry-after"), "60");
          limited = true;
          break;
        }
      }
      assert.equal(limited, true);
    });
  } finally {
    await mf.dispose();
  }
});
