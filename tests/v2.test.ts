import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinalQuery,
  contentAllows,
  normalizeGraphicLevel,
  normalizeRating,
} from "../shared/content";
import { rarity } from "../shared/rarity";
import type {
  ContentSettings,
  NormalizedImage,
  Pony,
  ProviderId,
} from "../shared/types";
import { achievements, blankJournal, discover } from "../src/discoveries";

const normalized = (provider: ProviderId, tags: string[]): NormalizedImage => ({
  provider,
  providerId: 123,
  canonicalId: `${provider}:123`,
  width: 1000,
  height: 1000,
  format: "png",
  score: 100,
  tags,
  artists: [],
  pageUrl: `https://${provider}.example/123`,
  rating: normalizeRating(provider, tags),
  graphicLevel: normalizeGraphicLevel(provider, tags),
  spoilered: false,
  featured: false,
  representations: { full: "https://example.test/123.png" },
});

const allowed = (tags: string[], content: ContentSettings) =>
  contentAllows(normalized("derpibooru", tags), content);

test("provider-specific normalizers fail closed for unknown ratings", () => {
  for (const provider of ["derpibooru", "trixiebooru", "twibooru"] as const) {
    assert.equal(normalizeRating(provider, ["safe"]), "safe");
    assert.equal(normalizeRating(provider, ["suggestive"]), "suggestive");
    assert.equal(normalizeRating(provider, ["questionable"]), "questionable");
    assert.equal(normalizeRating(provider, ["explicit"]), "explicit");
    assert.equal(normalizeRating(provider, []), "unknown");
    assert.equal(normalizeRating(provider, ["safe", "explicit"]), "unknown");
    assert.equal(normalizeGraphicLevel(provider, ["safe"]), "clean");
    assert.equal(normalizeGraphicLevel(provider, ["safe", "grimdark"]), "dark");
    assert.equal(normalizeGraphicLevel(provider, ["safe", "gore"]), "graphic");
    assert.equal(
      normalizeGraphicLevel(provider, ["safe", "grimdark", "grotesque"]),
      "graphic",
    );
  }
});

test("sexual and graphic dimensions remain independent", () => {
  const cases: Array<[ContentSettings, string[], boolean]> = [
    [
      { contentLevel: "safe", adultMode: "all", graphicLevel: "clean" },
      ["safe"],
      true,
    ],
    [
      { contentLevel: "safe", adultMode: "all", graphicLevel: "clean" },
      ["safe", "grimdark"],
      false,
    ],
    [
      { contentLevel: "safe", adultMode: "all", graphicLevel: "dark" },
      ["safe", "grimdark"],
      true,
    ],
    [
      { contentLevel: "safe", adultMode: "all", graphicLevel: "graphic" },
      ["safe", "gore"],
      true,
    ],
    [
      { contentLevel: "teen", adultMode: "all", graphicLevel: "clean" },
      ["suggestive"],
      true,
    ],
    [
      { contentLevel: "teen", adultMode: "all", graphicLevel: "dark" },
      ["suggestive", "grimdark"],
      true,
    ],
    [
      { contentLevel: "adult", adultMode: "all", graphicLevel: "clean" },
      ["questionable"],
      true,
    ],
    [
      { contentLevel: "adult", adultMode: "all", graphicLevel: "clean" },
      ["explicit", "gore"],
      false,
    ],
    [
      { contentLevel: "adult", adultMode: "all", graphicLevel: "graphic" },
      ["explicit", "gore"],
      true,
    ],
    [
      { contentLevel: "adult", adultMode: "explicit", graphicLevel: "graphic" },
      ["explicit", "grotesque"],
      true,
    ],
    [
      { contentLevel: "adult", adultMode: "explicit", graphicLevel: "graphic" },
      ["questionable", "gore"],
      false,
    ],
    [
      { contentLevel: "safe", adultMode: "all", graphicLevel: "graphic" },
      [],
      false,
    ],
  ];
  for (const [settings, tags, expected] of cases)
    assert.equal(
      allowed(tags, settings),
      expected,
      `${JSON.stringify(settings)} ${tags}`,
    );
});

test("query builder emits the exact selected content policy", () => {
  const q = (content: ContentSettings) =>
    buildFinalQuery({ content, character: "fluttershy", mode: "top" });
  assert.match(
    q({ contentLevel: "safe", adultMode: "all", graphicLevel: "clean" }),
    /^safe,-suggestive,-questionable,-explicit,-semi-grimdark,-grimdark,-gore,-grotesque,.*fluttershy,score\.gt:100$/,
  );
  assert.match(
    q({ contentLevel: "teen", adultMode: "all", graphicLevel: "dark" }),
    /^suggestive,-safe,-questionable,-explicit,-gore,-grotesque,/,
  );
  assert.match(
    q({ contentLevel: "adult", adultMode: "all", graphicLevel: "clean" }),
    /^\(questionable OR explicit\),-safe,-suggestive,-semi-grimdark,-grimdark,-gore,-grotesque,/,
  );
  assert.match(
    q({
      contentLevel: "adult",
      adultMode: "questionable",
      graphicLevel: "graphic",
    }),
    /^questionable,-safe,-suggestive,-explicit,/,
  );
  assert.match(
    q({
      contentLevel: "adult",
      adultMode: "explicit",
      graphicLevel: "graphic",
    }),
    /^explicit,-safe,-suggestive,-questionable,/,
  );
});

const pony: Pony = {
  ...normalized("derpibooru", ["safe", "fluttershy"]),
  id: 123,
  image: "/api/image/derpibooru/123",
  preview: "/api/image/derpibooru/123?size=preview",
  contentLevel: "safe",
  adultMode: "all",
  selectedGraphicLevel: "clean",
};

test("rarity is metadata-derived and collection de-duplicates canonical IDs", () => {
  assert.equal(rarity({ ...pony, score: 0 }), "Common");
  assert.equal(rarity({ ...pony, score: 80 }), "Uncommon");
  assert.equal(rarity({ ...pony, score: 250 }), "Rare");
  assert.equal(rarity({ ...pony, score: 600 }), "Epic");
  assert.equal(rarity({ ...pony, score: 1200 }), "Legendary");
  assert.equal(
    rarity({
      ...pony,
      score: 1600,
      favorites: 1100,
      wilsonScore: 0.99,
      featured: true,
    }),
    "Harmony",
  );
  let journal = discover(blankJournal(), pony);
  journal = discover(journal, {
    ...pony,
    provider: "twibooru",
    providerId: 456,
  });
  assert.equal(journal.totalRolls, 2);
  assert.equal(journal.items.length, 1);
  assert.equal(journal.items[0]?.count, 2);
  assert.deepEqual(achievements(journal, []), ["First Roll"]);
});
