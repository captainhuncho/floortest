import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-discard-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;

test("discardFiles deletes a replaced file, and keeps a failed delete queued for the retry", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { discardFiles } = await import("../src/lib/deletion");
  const store = await storage();
  const queued = async () => (await q.all<{ file_key: string }>("SELECT file_key FROM storage_deletions ORDER BY file_key")).map((r) => r.file_key);

  // A replaced cover: deleted straight away, nothing left queued.
  await store.put("covers/1-old.webp", new Uint8Array(3), "image/webp");
  await discardFiles(["covers/1-old.webp", null, undefined], "cover replaced");
  assert.equal(await store.head("covers/1-old.webp"), null);
  assert.deepEqual(await queued(), []);

  // A delete the store refuses (here: a folder where the file should be) stays queued instead of being forgotten.
  await store.put("covers/stuck/inner.webp", new Uint8Array(3), "image/webp");
  await discardFiles(["covers/stuck", "covers/stuck"], "cover replaced");
  assert.deepEqual(await queued(), ["covers/stuck"]);
});
