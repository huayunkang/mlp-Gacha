import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFavoritesBackup,
  searchCollection,
  mergeFavorites,
} from "../src/collection";

const raw = (id: number, score = 10) => ({
  id,
  width: 1200,
  height: 1000,
  score,
  tags: ["safe", "fluttershy"],
  artists: ["artist:example"],
  savedAt: id,
});
const backup = (favorites: unknown[]) =>
  JSON.stringify({ app: "pony-roulette", version: 1, favorites });

test("collection search combines terms and sorts without mutating records", () => {
  const items = parseFavoritesBackup(backup([raw(1), raw(2, 800)]));
  assert.deepEqual(
    searchCollection(items, "FLUTTERSHY example", "score").map((p) => p.id),
    [2, 1],
  );
  assert.deepEqual(
    searchCollection(items, "2", "recent").map((p) => p.id),
    [2],
  );
  assert.deepEqual(
    searchCollection(items, "", "rarity").map((p) => p.id),
    [2, 1],
  );
  assert.equal(searchCollection(items, "missing", "recent").length, 0);
  assert.deepEqual(
    items.map((p) => p.id),
    [1, 2],
  );
});

test("backup import reconstructs trusted identity and content classifications", () => {
  const [item] = parseFavoritesBackup(
    backup([
      {
        ...raw(1),
        tags: ["explicit", "gore"],
        rating: "safe",
        canonicalId: "evil",
        image: "https://evil.test/a",
        pageUrl: "javascript:alert(1)",
        sourceUrl: "https://evil.test",
        featured: "yes",
      },
    ]),
  );
  assert.equal(item!.canonicalId, "derpibooru:1");
  assert.equal(item!.image, "");
  assert.equal(item!.pageUrl, "https://derpibooru.org/images/1");
  assert.equal(item!.sourceUrl, undefined);
  assert.equal(item!.rating, "explicit");
  assert.equal(item!.contentLevel, "adult");
  assert.equal(item!.graphicLevel, "graphic");
  assert.equal(item!.spoilered, true);
  assert.equal(item!.featured, false);
});

test("invalid backups are rejected atomically and merge retains existing favorite", () => {
  for (const data of [
    "{}",
    backup([raw(1), { ...raw(2), providerId: -1 }]),
    backup([{ ...raw(1), tags: ["a".repeat(501)] }]),
    backup([{ ...raw(1), derpibooruId: -1 }]),
  ])
    assert.throws(() => parseFavoritesBackup(data));
  const existing = parseFavoritesBackup(backup([raw(1, 50)]));
  const incoming = parseFavoritesBackup(backup([raw(1, 99), raw(2)]));
  const merged = mergeFavorites(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((p) => p.id === 1)!.score, 50);
  const full = parseFavoritesBackup(
    backup(Array.from({ length: 1000 }, (_, i) => raw(i + 1))),
  );
  assert.deepEqual(
    mergeFavorites(full, parseFavoritesBackup(backup([raw(1001)]))).map(
      (p) => p.id,
    ),
    searchCollection(full, "", "recent").map((p) => p.id),
  );
});
