import { z } from "zod";
import { buildFinalQuery, contentAllows } from "../../shared/content";
import {
  characters,
  type Character,
  type ContentSettings,
  type Mode,
  type NormalizedImage,
  type ProviderId,
} from "../../shared/types";
import { providers, providerById } from "../providers";
import { ProviderError } from "../providers/http";
import type { Env } from "../types";
import { ServiceError } from "./errors";

type ProviderState = {
  status: "online" | "unavailable" | "unknown";
  checkedAt?: string;
  reason?: string;
};

const imageSchema = z.object({
  provider: z.enum(["derpibooru", "trixiebooru", "twibooru"]),
  providerId: z.number().int().positive(),
  canonicalId: z.string().min(3).max(100),
  derpibooruId: z.number().int().positive().optional(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  format: z.string(),
  score: z.number(),
  wilsonScore: z.number().optional(),
  upvotes: z.number().optional(),
  downvotes: z.number().optional(),
  favorites: z.number().optional(),
  tags: z.array(z.string()),
  artists: z.array(z.string()),
  sourceUrl: z.string().optional(),
  sourceUrls: z.array(z.string()).optional(),
  pageUrl: z.string(),
  rating: z.enum(["safe", "suggestive", "questionable", "explicit", "unknown"]),
  graphicLevel: z.enum(["clean", "dark", "graphic", "unknown"]),
  spoilered: z.boolean(),
  featured: z.boolean(),
  createdAt: z.string().optional(),
  representations: z.object({
    thumb: z.string().optional(),
    small: z.string().optional(),
    medium: z.string().optional(),
    large: z.string().optional(),
    full: z.string().optional(),
  }),
});

const stateKey = (provider: ProviderId) =>
  new Request(`https://pony.internal/provider-health/${provider}`);
const activeKey = new Request("https://pony.internal/provider-health/active");

async function recordProvider(
  provider: ProviderId,
  status: ProviderState["status"],
  reason?: string,
) {
  const state: ProviderState = {
    status,
    checkedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
  await caches.default
    .put(
      stateKey(provider),
      Response.json(state, {
        headers: { "Cache-Control": "public, max-age=600" },
      }),
    )
    .catch(() => {});
}

async function recordActive(provider: ProviderId) {
  await caches.default
    .put(
      activeKey,
      Response.json(
        { provider, checkedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "public, max-age=600" } },
      ),
    )
    .catch(() => {});
}

export async function providerHealthSnapshot() {
  const states = await Promise.all(
    providers.map(async (provider) => {
      const response = await caches.default.match(stateKey(provider.id));
      const state: ProviderState = response
        ? ((await response.json()) as ProviderState)
        : { status: "unknown" };
      return [provider.id, state] as const;
    }),
  );
  const activeResponse = await caches.default.match(activeKey);
  const active = activeResponse
    ? ((await activeResponse.json()) as { provider?: ProviderId }).provider
    : undefined;
  return { providers: Object.fromEntries(states), active: active ?? null };
}

function metadataKey(
  provider: ProviderId,
  id: number,
  content: ContentSettings,
  filterId: number,
) {
  return new Request(
    `https://pony.internal/provider-image/${provider}/${id}/${content.contentLevel}/${content.adultMode}/${content.graphicLevel}/${filterId}`,
  );
}

export async function rememberProviderImage(
  image: NormalizedImage,
  content: ContentSettings,
  filterId: number,
) {
  await caches.default
    .put(
      metadataKey(image.provider, image.providerId, content, filterId),
      Response.json(image, {
        headers: { "Cache-Control": "public, max-age=21600" },
      }),
    )
    .catch(() => {});
}

export async function searchWithFailover(
  env: Env,
  options: {
    character: Character;
    mode: Mode;
    content: ContentSettings;
    filterId: number;
    tag?: string;
    excludeCanonicalId?: string;
  },
) {
  const keys = Object.keys(characters).filter(
    (key) => key !== "all",
  ) as Character[];
  const character =
    options.mode === "surprise"
      ? keys[Math.floor(Math.random() * keys.length)]!
      : options.character;
  const themes = ["solo", "smiling", "scenery", "cute"];
  const theme =
    options.mode === "surprise"
      ? themes[Math.floor(Math.random() * themes.length)]
      : undefined;
  const query = buildFinalQuery({
    content: options.content,
    character,
    mode: options.mode,
    tag: [options.tag, theme].filter(Boolean).join(",") || undefined,
  });
  let sawNoMatch = false;
  for (const provider of providers) {
    try {
      const image = await provider.searchRandom(env, {
        query,
        content: options.content,
        filterId: options.filterId,
        excludeCanonicalId: options.excludeCanonicalId,
      });
      await Promise.all([
        recordProvider(provider.id, "online"),
        recordActive(provider.id),
        rememberProviderImage(image, options.content, options.filterId),
      ]);
      return image;
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      sawNoMatch ||= error.code === "no_match";
      await recordProvider(
        provider.id,
        error.code === "no_match" ? "online" : "unavailable",
        error.code,
      );
      if (!error.retryable) throw new ServiceError(error.message, error.status);
    }
  }
  throw new ServiceError(
    sawNoMatch
      ? "这个筛选组合暂时没有找到图片。请放宽筛选或再试一次。"
      : "这次胶囊好像真的卡住了……暂时无法连接图库。",
    sawNoMatch ? 404 : 503,
  );
}

export async function getProviderImage(
  env: Env,
  providerId: ProviderId,
  id: number,
  content: ContentSettings,
  filterId: number,
) {
  const key = metadataKey(providerId, id, content, filterId);
  const cached = await caches.default.match(key);
  if (cached) {
    const parsed = imageSchema.safeParse(await cached.json());
    if (parsed.success && contentAllows(parsed.data, content))
      return parsed.data;
  }
  const provider = providerById(providerId);
  try {
    const image = await provider.getImage(env, id, {
      content,
      filterId,
    });
    await Promise.all([
      recordProvider(provider.id, "online"),
      rememberProviderImage(image, content, filterId),
    ]);
    return image;
  } catch (error) {
    if (error instanceof ProviderError) {
      await recordProvider(provider.id, "unavailable", error.code);
      throw new ServiceError(error.message, error.status);
    }
    throw error;
  }
}
