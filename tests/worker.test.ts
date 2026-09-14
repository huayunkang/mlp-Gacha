import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { mediaUrl } from "../shared/safety";
import { validImage } from "../shared/image-format";
import type { Pony } from "../shared/types";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1kAAAAASUVORK5CYII=",
  "base64",
);

const filters = {
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
};

const philomenaImage = (id: number, tags = ["safe", "fluttershy"]) => ({
  id,
  width: 1600,
  height: 1200,
  format: "png",
  score: 250,
  tags,
  spoilered: false,
  representations: {
    full: `https://derpicdn.net/img/${id}.png`,
    large: `https://derpicdn.net/img/${id}.png`,
    thumb: `https://derpicdn.net/img/${id}-thumb.png`,
  },
});

const twibooruPost = (id: number, tags = ["safe", "fluttershy"]) => ({
  id,
  media_type: "image",
  width: 1800,
  height: 1200,
  format: "png",
  score: 300,
  tags,
  spoilered: false,
  locations: [{ location: "derpibooru", id_at_location: 424242 }],
  representations: {
    full: `https://cdn.twibooru.org/img/${id}.png`,
    large: `https://cdn.twibooru.org/img/${id}.png`,
    thumb: `https://cdn.twibooru.org/img/${id}-thumb.png`,
  },
});

type ProviderOutcome = "ok" | "503" | "challenge" | "empty";
interface HarnessState {
  derpibooru: ProviderOutcome;
  trixiebooru: ProviderOutcome;
  twibooru: ProviderOutcome;
  events: URL[];
  tags?: string[];
}

let bundled: string;
async function bundle() {
  if (bundled) return bundled;
  const result = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  bundled = result.outputFiles[0]!.text;
  return bundled;
}

async function makeWorker(state: HarnessState) {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: await bundle(),
      compatibilityDate: "2026-09-01",
      bindings: {
        DERPIBOORU_BASE_URL: "https://derpibooru.org",
        REQUEST_TIMEOUT_MS: "500",
        PROVIDER_TIMEOUT_MS: "500",
        REQUEST_RETRIES: "0",
        MAX_IMAGE_SIZE_MB: "1",
        CACHE_TTL_DAYS: "30",
        EDGE_CACHE_SECONDS: "0",
      },
      ratelimits: Object.fromEntries(
        ["RANDOM_LIMITER", "IMAGE_LIMITER", "HEALTH_LIMITER"].map(
          (name, index) => [
            name,
            {
              namespace_id: String(3000 + index),
              simple: { limit: 1000, period: 60 },
            },
          ],
        ),
      ),
      outboundService: async (request) => {
        const url = new URL(request.url);
        state.events.push(url);
        if (
          url.hostname === "derpicdn.net" ||
          url.hostname === "cdn.twibooru.org"
        )
          return new MFResponse(png, {
            headers: { "Content-Type": "image/png" },
          });
        if (
          url.hostname === "derpibooru.org" &&
          url.pathname.endsWith("/filters/system")
        )
          return MFResponse.json(filters);

        const provider = url.hostname.startsWith("trixie")
          ? "trixiebooru"
          : url.hostname.startsWith("twi")
            ? "twibooru"
            : "derpibooru";
        const outcome = state[provider];
        if (outcome === "503")
          return new MFResponse("unavailable", { status: 503 });
        if (outcome === "challenge")
          return new MFResponse("<html>challenge</html>", {
            status: 403,
            headers: { "Content-Type": "text/html" },
          });
        if (provider === "twibooru") {
          if (url.pathname.includes("search/posts"))
            return MFResponse.json({
              posts: outcome === "empty" ? [] : [twibooruPost(912, state.tags)],
            });
          return MFResponse.json({ post: twibooruPost(912, state.tags) });
        }
        return MFResponse.json({
          images:
            outcome === "empty"
              ? []
              : [
                  philomenaImage(
                    provider === "derpibooru" ? 111 : 222,
                    state.tags,
                  ),
                ],
        });
      },
    }),
  );
}

const searches = (state: HarnessState) =>
  state.events.filter((url) => /search\/(images|posts)$/.test(url.pathname));

test("image host validation blocks SSRF shapes", () => {
  assert.equal(
    mediaUrl("derpibooru", "https://derpicdn.net/img/a").hostname,
    "derpicdn.net",
  );
  assert.equal(
    mediaUrl("twibooru", "https://cdn.twibooru.org/img/a").hostname,
    "cdn.twibooru.org",
  );
  for (const value of [
    "http://derpicdn.net/a",
    "https://derpicdn.net.evil.test/a",
    "https://127.0.0.1/a",
    "https://user@derpicdn.net/a",
    "https://derpicdn.net:4430/a",
  ])
    assert.throws(() => mediaUrl("derpibooru", value));
  assert.equal(validImage(png, "image/png"), true);
  assert.equal(validImage(Buffer.from("<html>"), "image/png"), false);
});

test("primary success never contacts either backup", async () => {
  const state: HarnessState = {
    derpibooru: "ok",
    trixiebooru: "ok",
    twibooru: "ok",
    events: [],
  };
  const worker = await makeWorker(state);
  try {
    const response = await worker.dispatchFetch(
      "https://pony.test/api/random?character=fluttershy&content=safe&graphic=clean",
    );
    assert.equal(response.status, 200);
    const pony = (await response.json()) as Pony;
    assert.equal(pony.provider, "derpibooru");
    assert.equal(pony.rating, "safe");
    assert.equal(pony.graphicLevel, "clean");
    assert.match(pony.image, /^\/api\/image\/derpibooru\/111\?/);
    assert.doesNotMatch(
      JSON.stringify(pony),
      /derpicdn\.net|cdn\.twibooru\.org/,
    );
    assert.deepEqual(
      searches(state).map((url) => url.hostname),
      ["derpibooru.org"],
    );
  } finally {
    await worker.dispose();
  }
});

test("failover is sequential and preserves Safe + Clean on Trixiebooru", async () => {
  const state: HarnessState = {
    derpibooru: "503",
    trixiebooru: "ok",
    twibooru: "ok",
    events: [],
  };
  const worker = await makeWorker(state);
  try {
    const response = await worker.dispatchFetch(
      "https://pony.test/api/random?content=safe&adultMode=all&graphic=clean",
    );
    const pony = (await response.json()) as Pony;
    assert.equal(response.status, 200);
    assert.equal(pony.provider, "trixiebooru");
    const requests = searches(state);
    assert.deepEqual(
      requests.map((url) => url.hostname),
      ["derpibooru.org", "trixiebooru.org"],
    );
    assert.equal(
      requests[0]!.searchParams.get("q"),
      requests[1]!.searchParams.get("q"),
    );
    assert.match(
      requests[1]!.searchParams.get("q")!,
      /safe,-suggestive,-questionable,-explicit/,
    );
    assert.match(
      requests[1]!.searchParams.get("q")!,
      /-grimdark,-gore,-grotesque/,
    );
  } finally {
    await worker.dispose();
  }
});

test("challenge and outage fall through to Twibooru with canonical mapping", async () => {
  const state: HarnessState = {
    derpibooru: "503",
    trixiebooru: "challenge",
    twibooru: "ok",
    events: [],
    tags: ["suggestive", "grimdark"],
  };
  const worker = await makeWorker(state);
  try {
    const response = await worker.dispatchFetch(
      "https://pony.test/api/random?content=teen&graphic=dark",
    );
    assert.equal(response.status, 200);
    const pony = (await response.json()) as Pony;
    assert.equal(pony.provider, "twibooru");
    assert.equal(pony.canonicalId, "derpibooru:424242");
    assert.equal(pony.derpibooruId, 424242);
    assert.equal(pony.rating, "suggestive");
    assert.equal(pony.graphicLevel, "dark");
    const requests = searches(state);
    assert.deepEqual(
      requests.map((url) => url.hostname),
      ["derpibooru.org", "trixiebooru.org", "twibooru.org"],
    );
    assert.equal(
      requests[0]!.searchParams.get("q"),
      requests[2]!.searchParams.get("q"),
    );
    assert.match(
      requests[2]!.searchParams.get("q")!,
      /suggestive,-safe,-questionable,-explicit/,
    );
    assert.equal(requests[2]!.searchParams.get("filter_id"), "2");

    const image = await worker.dispatchFetch(
      "https://pony.test/api/image/twibooru/912?filter=100073&content=teen&adultMode=all&graphic=dark",
    );
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-pony-provider"), "twibooru");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  } finally {
    await worker.dispose();
  }
});

test("all providers failing returns themed 503 and health is passive", async () => {
  const state: HarnessState = {
    derpibooru: "503",
    trixiebooru: "503",
    twibooru: "503",
    events: [],
  };
  const worker = await makeWorker(state);
  try {
    const response = await worker.dispatchFetch("https://pony.test/api/random");
    assert.equal(response.status, 503);
    assert.match(JSON.stringify(await response.json()), /再试一次/);
    assert.deepEqual(
      searches(state).map((url) => url.hostname),
      ["derpibooru.org", "trixiebooru.org", "twibooru.org"],
    );
    const before = state.events.length;
    const health = await worker.dispatchFetch("https://pony.test/api/health");
    const report = (await health.json()) as {
      status: string;
      providers: Record<string, string>;
      active: string | null;
      mediaCache: string;
    };
    assert.equal(report.status, "degraded");
    assert.deepEqual(report.providers, {
      derpibooru: "unavailable",
      trixiebooru: "unavailable",
      twibooru: "unavailable",
    });
    assert.equal(report.active, null);
    assert.equal(report.mediaCache, "edge");
    assert.equal(
      state.events.length,
      before,
      "health must not fan out live probes",
    );
  } finally {
    await worker.dispose();
  }
});

test("unknown, mismatched, and unapproved parameters fail closed", async () => {
  const state: HarnessState = {
    derpibooru: "ok",
    trixiebooru: "ok",
    twibooru: "ok",
    events: [],
  };
  const worker = await makeWorker(state);
  try {
    for (const path of [
      "/api/random?content=other",
      "/api/random?graphic=other",
      "/api/random?adultMode=other",
      "/api/random?q=explicit",
      "/api/random?tag=safe%20OR%20explicit",
      "/api/random?filter=99999",
      "/api/image/evil/1",
      "/api/image/derpibooru/abc",
      "/api/image/derpibooru/1?url=https://evil.test",
    ])
      assert.equal(
        (await worker.dispatchFetch(`https://pony.test${path}`)).status,
        400,
        path,
      );
  } finally {
    await worker.dispose();
  }
});
