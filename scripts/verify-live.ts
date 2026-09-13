import { fetch, EnvHttpProxyAgent } from "undici";
import { mkdir, writeFile } from "node:fs/promises";
import { query, imageSchema, safeImage } from "../shared/safety.js";
import type { Character, Mode } from "../shared/types.js";
const dispatcher = new EnvHttpProxyAgent();
const cases: [Character, Mode][] = [
  ["all", "random"],
  ["fluttershy", "random"],
  ["all", "top"],
  ["all", "featured"],
];
const results: unknown[] = [];
await mkdir("test-results", { recursive: true });
for (const [character, mode] of cases) {
  try {
    const u = new URL("https://derpibooru.org/api/v1/json/search/images");
    u.searchParams.set("q", query(character, mode));
    u.searchParams.set("sf", "random");
    u.searchParams.set("per_page", "1");
    const r = await fetch(u, {
      dispatcher,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as { total: number; images: unknown[] };
    const i = imageSchema.parse(data.images[0]);
    if (!safeImage(i)) throw new Error("Unsafe upstream result");
    if (mode === "top" && i.score <= 100)
      throw new Error("Score filter mismatch");
    if (mode === "featured" && !i.tags.includes("featured image"))
      throw new Error("Featured filter mismatch");
    if (character === "fluttershy" && !i.tags.includes("fluttershy"))
      throw new Error("Character filter mismatch");
    results.push({
      character,
      mode,
      status: "pass",
      total: data.total,
      id: i.id,
      score: i.score,
    });
    await writeFile(
      `test-results/live-${mode}-${character}.json`,
      JSON.stringify(i, null, 2),
    );
    console.log(character, mode, "PASS", i.id);
  } catch (e) {
    results.push({ character, mode, status: "failed", error: String(e) });
    console.error(character, mode, String(e));
    process.exitCode = 1;
  }
}
await writeFile(
  "test-results/live-api.json",
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
await dispatcher.close();
