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

test("a track's cover in the players: its own artwork, then its release's, then its callout's, else none", async () => {
  const { playerCover } = await import("../src/lib/covers");
  const bare = { id: 7, art_key: null, collection_id: null, callout_art_key: null };
  assert.equal(playerCover(bare), null, "no artwork anywhere: the players keep their placeholder");
  assert.equal(playerCover({ ...bare, collection_id: 3, callout_art_key: "c.png" }), "/api/collection-art/3?v=c.png&size=thumb", "the callout's cover, small");
  assert.equal(playerCover({ ...bare, collection_id: null, callout_art_key: "c.png" }), null, "a cover with no callout to fetch it from is never linked");
  assert.equal(playerCover(bare, { id: 9, art_key: "r.png" }), "/api/track-art/9?v=r.png&size=thumb", "a release's shared artwork");
  assert.equal(
    playerCover({ id: 7, art_key: "t.png", collection_id: 3, callout_art_key: "c.png" }, { id: 9, art_key: "r.png" }),
    "/api/track-art/7?v=t.png&size=thumb",
    "the track's own artwork leads",
  );
  assert.equal(playerCover({ ...bare, collection_id: 3, callout_art_key: "a b.png" }), "/api/collection-art/3?v=a%20b.png&size=thumb", "keys are encoded");
});

test("list rows carry only the cover link, only for the web players, and never another desk's artwork", async () => {
  const { q } = await import("../src/lib/db");
  const { loadRows } = await import("../src/app/dashboard/rows");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@x.io`, handle, handle, t, t,
    ))!.id;
  const a = await user("playera");
  const b = await user("playerb");
  const callout = async (owner: number, art: string | null) =>
    (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, art_key, created_at) VALUES (?, 'Night set', ?, ?) RETURNING id", owner, art, t))!.id;
  const sender = async (owner: number) => (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, t))!.id;
  const senders = new Map([[a, await sender(a)], [b, await sender(b)]]);
  let n = 0;
  const track = async (owner: number, coll: number | null, art: string | null) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, art_key, created_at) VALUES (?,?,?,'T','A',?,?,'a.wav','audio/wav',1,?,?) RETURNING id",
      owner, senders.get(owner), coll, `pc${++n}`, `audio/pc${n}.wav`, art, t + n,
    ))!.id;

  const mine = await callout(a, "collection-art/a/own.webp");
  const theirs = await callout(b, "collection-art/b/own.webp");
  const inCallout = await track(a, mine, null);
  const ownArt = await track(a, mine, "track-art/own.jpg");
  const loose = await track(a, null, null);
  // A track can't name another desk's callout at all: the database refuses the row, and the list's join is desk-scoped too.
  await assert.rejects(track(a, theirs, null), /tracks_collection_same_desk/);
  const bTrack = await track(b, theirs, null);

  const rows = await loadRows(a, { covers: true, actor: a });
  const cover = (id: number) => rows.find((r) => r.id === id)?.cover ?? null;
  assert.equal(cover(inCallout), `/api/collection-art/${mine}?v=${encodeURIComponent("collection-art/a/own.webp")}&size=thumb`, "no artwork of its own: the callout's cover");
  assert.equal(cover(ownArt), `/api/track-art/${ownArt}?v=${encodeURIComponent("track-art/own.jpg")}&size=thumb`, "its own artwork leads");
  assert.equal(cover(loose), null, "no callout, no artwork: the placeholder");
  assert.ok(!rows.some((r) => r.id === bTrack), "and another desk's tracks aren't in the list at all");
  assert.ok(!JSON.stringify(rows).includes(`/api/collection-art/${theirs}`), "desk B's cover link appears nowhere in desk A's rows");
  for (const r of rows) {
    const sent = r as Record<string, unknown>;
    for (const k of ["art_key", "callout_art_key", "collection_id", "user_id"]) assert.ok(!(k in sent), `${k} stays on the server`);
  }

  const theirRows = await loadRows(b, { covers: true, actor: b });
  assert.deepEqual(theirRows.map((r) => r.id), [bTrack], "desk B reads only its own track");
  assert.ok(!JSON.stringify(theirRows).includes(`/api/collection-art/${mine}`) && !JSON.stringify(theirRows).includes(`/api/track-art/${ownArt}`), "and none of desk A's cover links");

  // The app's API reads the same rows without asking for covers: the link isn't in its payload.
  assert.ok((await loadRows(a, { actor: a })).every((r) => !("cover" in r)), "no cover unless the web desk asks");
});
