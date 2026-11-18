import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-covers-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("a callout's cover: its own artwork first, then its tracks', four at most, never repeated", async () => {
  const { pickCovers } = await import("../src/lib/covers");
  assert.deepEqual(pickCovers(null, []), [], "no art at all: the plain tile");
  assert.deepEqual(pickCovers("own", []), ["own"], "one: drawn full size");
  assert.deepEqual(pickCovers(null, ["a", "b"]), ["a", "b"], "two: the tile shows the first, nothing is repeated to fill four");
  assert.deepEqual(pickCovers("own", ["a", "b", "c", "d"]), ["own", "a", "b", "c"], "own artwork leads, capped at four");
});

test("covers come from the desk's own live tracks, and their artwork stays behind the file check", async () => {
  const { q } = await import("../src/lib/db");
  const { calloutCovers } = await import("../src/lib/covers");
  const { fileAccess } = await import("../src/lib/file-access");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number; plan: string; actor_id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id, plan, id AS actor_id",
      `${handle}@x.io`, handle, handle, t, t,
    ))!;
  const mine = await user("coverme");
  const theirs = await user("coverthem");
  const callout = async (owner: number, art: string | null) =>
    (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, art_key, created_at) VALUES (?, 'Night set', ?, ?) RETURNING id", owner, art, t))!.id;
  const sender = async (owner: number) => (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, t))!.id;
  const senders = new Map([[mine.id, await sender(mine.id)], [theirs.id, await sender(theirs.id)]]);
  let n = 0;
  const track = async (owner: number, coll: number, art: string | null, deletedAt: number | null = null) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, art_key, created_at, deleted_at) VALUES (?,?,?,'T','A',?,?,'a.wav','audio/wav',1,?,?,?) RETURNING id",
      owner, senders.get(owner), coll, `cov${++n}`, `audio/cov${n}.wav`, art, t + n, deletedAt,
    ))!.id;

  const withArt = await callout(mine.id, "collection-art/1/own.webp");
  const plain = await callout(mine.id, null);
  const empty = await callout(mine.id, null);
  const oldest = await track(mine.id, withArt, "track-art/a.jpg");
  await track(mine.id, withArt, null); // no artwork: skipped
  const b = await track(mine.id, withArt, "track-art/b.jpg");
  const c = await track(mine.id, withArt, "track-art/c.jpg");
  const gone = await track(mine.id, withArt, "track-art/gone.jpg", t);
  const d = await track(mine.id, withArt, "track-art/d.jpg");
  const onlyTrack = await track(mine.id, plain, "track-art/p.jpg");
  const elsewhere = await callout(theirs.id, null);
  const theirTrack = await track(theirs.id, elsewhere, "track-art/theirs.jpg");

  const covers = await calloutCovers(mine);
  const urls = covers.get(withArt) ?? [];
  assert.equal(urls.length, 4, "four at most");
  assert.match(urls[0], new RegExp(`^/api/collection-art/${withArt}\\?v=`), "its own artwork first");
  assert.deepEqual(
    urls.slice(1).map((u) => Number(u.split("/")[3].split("?")[0])),
    [d, c, b],
    "then its newest tracks with artwork; deleted ones and the oldest past four left out",
  );
  assert.ok(!urls.some((u) => u.startsWith(`/api/track-art/${gone}?`) || u.startsWith(`/api/track-art/${oldest}?`)));
  assert.deepEqual(covers.get(plain), [`/api/track-art/${onlyTrack}?v=${encodeURIComponent("track-art/p.jpg")}`], "a callout with no artwork of its own shows its track's");
  assert.equal(covers.get(empty), undefined, "nothing with art: no cover, the plain tile");
  assert.equal(covers.get(elsewhere), undefined, "another desk's callouts never show up");
  assert.ok(![...covers.values()].flat().some((u) => u.startsWith(`/api/track-art/${theirTrack}?`)));

  // The cover links go through /api/track-art, which asks fileAccess every time: only the desk that holds the track gets its art.
  assert.equal((await fileAccess(mine, "art", d))?.key, "track-art/d.jpg", "my track's art, on my desk");
  assert.equal(await fileAccess(theirs, "art", d), null, "another desk can't fetch it, even with the real id");
  assert.equal(await fileAccess(null, "art", d), null, "nor someone signed out");
  assert.equal(await fileAccess(mine, "art", gone), null, "nor the art of a deleted track");
});

test("rows and tiles get a small WebP of the artwork, not the full image", async () => {
  const sharp = (await import("sharp")).default;
  const { storage } = await import("../src/lib/storage");
  const { thumbResponse, THUMB_SIDE } = await import("../src/lib/art-thumb");
  const store = await storage();
  const big = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#b4f" } }).webp().toBuffer();
  await store.put("collection-art/thumb-test.webp", new Uint8Array(big), "image/webp");
  const r = await thumbResponse("collection-art/thumb-test.webp", 600);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  assert.equal(r.headers.get("cache-control"), "private, max-age=600", "kept no longer than access lasts");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  const out = Buffer.from(await r.arrayBuffer());
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(Math.max(meta.width ?? 0, meta.height ?? 0) <= THUMB_SIDE, `at most ${THUMB_SIDE}px`);
  assert.ok(out.byteLength < big.byteLength, "smaller than the stored artwork");
  assert.equal((await thumbResponse("collection-art/missing.webp", 600)).status, 404, "no file: not found");
});
