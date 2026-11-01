import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-file-reservations-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("leftover uploads: after a week, files nothing points to are queued for deletion and files in use are kept", async () => {
  const { q } = await import("../src/lib/db");
  const { reserveFile, settleFile, reconcileFiles, RESERVATION_GRACE_MS } = await import("../src/lib/file-reservations");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('c@x.io','h','C','coverdesk','pro','UTC',?,?) RETURNING id",
    t, t,
  ))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'C', ?) RETURNING id", uid, t))!.id;

  // Crashed after storing, before the database pointed to it: nothing points to these.
  await reserveFile("covers/1-lost.webp", "cover");
  await reserveFile("collection-art/1-lost.webp", "collection_art");
  await reserveFile("site/aaaaaaaaaaaaaaaaaa.webp", "site_image");
  // Crashed after the database pointed to it, before it was crossed off: these are in use.
  await reserveFile("covers/1-kept.webp", "cover");
  await q.run("UPDATE users SET cover_key = 'covers/1-kept.webp' WHERE id = ?", uid);
  await reserveFile("collection-art/1-kept.webp", "collection_art");
  await q.run("UPDATE collections SET art_key = 'collection-art/1-kept.webp' WHERE id = ?", col);
  // Site images count as used in a draft, on the live page, or in its history (for rolling back), in whatever form.
  await reserveFile("site/bbbbbbbbbbbbbbbbbb.webp", "site_image");
  await q.run("INSERT INTO site_content (page, draft, published, updated_at) VALUES ('home', ?, '{}', ?)", JSON.stringify({ hero: "/api/site-image/bbbbbbbbbbbbbbbbbb.webp" }), t);
  await reserveFile("site/cccccccccccccccccc.webp", "site_image");
  await q.run("INSERT INTO site_content_versions (page, body, created_at) VALUES ('home', ?, ?)", JSON.stringify({ hero: "site/cccccccccccccccccc.webp" }), t);
  // A normal upload, crossed off straight away.
  await reserveFile("covers/1-done.webp", "cover");
  await settleFile("covers/1-done.webp");

  assert.equal(await reconcileFiles(t + 1000), 0, "nothing is touched inside the grace period");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM file_reservations"), 7);

  assert.equal(await reconcileFiles(t + RESERVATION_GRACE_MS + 60_000), 3, "only the three nothing points to");
  const queued = (await q.all<{ file_key: string }>("SELECT file_key FROM storage_deletions ORDER BY file_key")).map((r) => r.file_key);
  assert.deepEqual(queued, ["collection-art/1-lost.webp", "covers/1-lost.webp", "site/aaaaaaaaaaaaaaaaaa.webp"]);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM file_reservations"), 0, "every reservation is settled");
});
