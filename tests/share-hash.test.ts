import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-share-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("share links store only a fingerprint; the link works, the fingerprint doesn't, and a new link retires the old", async () => {
  const { q } = await import("../src/lib/db");
  const { createShare, shareByToken, tokenHash } = await import("../src/lib/share");
  const now = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('sharing', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
  const owner = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('o@x.io','h','Owner','owner','pro','UTC',?) RETURNING id", now))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, now))!.id;
  const track = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, share_ok) VALUES (?,?,'T','A','tok-t','audio/t.wav','t.wav','audio/wav',1,?,1) RETURNING id",
    owner, sender, now,
  ))!.id;
  const user = (await q.get<Record<string, unknown>>("SELECT * FROM users WHERE id = ?", owner))!;
  const t = (await q.get<Record<string, unknown>>("SELECT * FROM tracks WHERE id = ?", track))!;

  const first = (await createShare(user as never, t as never))!;
  assert.ok(first.token, "the full link is handed back once");
  const row = (await q.get<{ token: string | null; token_hash: string }>("SELECT token, token_hash FROM track_shares WHERE id = ?", first.id))!;
  assert.equal(row.token, null, "the secret itself is never stored");
  assert.equal(row.token_hash, tokenHash(first.token));
  assert.equal((await shareByToken(first.token))?.id, first.id);
  assert.equal(await shareByToken(row.token_hash), undefined, "the stored fingerprint is not a working link");

  const second = (await createShare(user as never, t as never))!;
  assert.notEqual(second.token, first.token);
  assert.equal(await shareByToken(first.token), undefined, "making a new link retires the old one at once");
  assert.equal((await shareByToken(second.token))?.id, second.id);
});
