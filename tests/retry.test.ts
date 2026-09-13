import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
test("Worker retries are bounded and back off; timeout cancels slow requests", async () => {
  const bundle = await build({
    stdin: {
      contents: `import {fetchBytes} from './worker/services/derpibooru'; export default {async fetch(req,env){try{await fetchBytes(new URL('https://derpibooru.org/api/v1/json/search/images'),env,1024);return new Response('ok');}catch{return new Response('unavailable',{status:503});}}}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  const times: number[] = [];
  const options = {
    modules: true,
    script: bundle.outputFiles[0]!.text,
    compatibilityDate: "2026-09-01",
    bindings: { REQUEST_TIMEOUT_MS: "100", REQUEST_RETRIES: "2" },
    outboundService: async () => {
      times.push(Date.now());
      return new MFResponse("offline", { status: 503 });
    },
  };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  try {
    const r = await mf.dispatchFetch("https://pony.test/");
    assert.equal(r.status, 503);
    assert.equal(times.length, 3);
    assert.ok(times[1]! - times[0]! >= 450);
    assert.ok(times[2]! - times[1]! >= 1400);
  } finally {
    await mf.dispose();
  }
  const slow = new Miniflare(
    convertV4MiniflareOptions({
      ...options,
      bindings: { REQUEST_TIMEOUT_MS: "100", REQUEST_RETRIES: "0" },
      outboundService: async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return new MFResponse("late");
      },
    }),
  );
  try {
    await slow.ready;
    const start = Date.now();
    assert.equal((await slow.dispatchFetch("https://pony.test/")).status, 503);
    assert.ok(Date.now() - start < 900);
  } finally {
    await slow.dispose();
  }
});
