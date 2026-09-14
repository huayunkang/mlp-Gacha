import { EnvHttpProxyAgent, fetch } from "undici";
import { z } from "zod";

const imageShape = z.object({
  id: z.number().int().positive(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  tags: z.array(z.string()),
  representations: z.object({ full: z.string() }).passthrough(),
});
const twibooruShape = imageShape.extend({ media_type: z.literal("image") });

const dispatcher = new EnvHttpProxyAgent();
const query =
  "safe,-suggestive,-questionable,-explicit,-semi-grimdark,-grimdark,-gore,-grotesque";

async function inspect(
  provider: string,
  endpoint: string,
  envelope: "images" | "posts",
) {
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("sf", "random");
  url.searchParams.set("per_page", "1");
  if (provider === "twibooru") url.searchParams.set("filter_id", "2");
  try {
    const response = await fetch(url, {
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("json")) {
      await response.body?.cancel();
      return { provider, status: response.status, compatible: false, type };
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const candidates = Array.isArray(raw[envelope]) ? raw[envelope] : [];
    const parsed =
      provider === "twibooru"
        ? twibooruShape.safeParse(candidates[0])
        : imageShape.safeParse(candidates[0]);
    return {
      provider,
      status: response.status,
      compatible: parsed.success,
      count: candidates.length,
      id: parsed.success ? parsed.data.id : null,
      rateLimit: {
        limit: response.headers.get("X-RL"),
        remaining: response.headers.get("X-RL-Remaining"),
        reset: response.headers.get("X-RL-Reset"),
      },
    };
  } catch (error) {
    return { provider, status: 0, compatible: false, error: String(error) };
  }
}

const results = [];
for (const item of [
  ["derpibooru", "https://derpibooru.org/api/v1/json/search/images", "images"],
  [
    "trixiebooru",
    "https://trixiebooru.org/api/v1/json/search/images",
    "images",
  ],
  ["twibooru", "https://twibooru.org/api/v3/search/posts", "posts"],
] as const)
  results.push(await inspect(item[0], item[1], item[2]));

console.log(
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
await dispatcher.close();

if (
  !results.find((result) => result.provider === "derpibooru")?.compatible ||
  !results.find((result) => result.provider === "twibooru")?.compatible
)
  process.exitCode = 1;
