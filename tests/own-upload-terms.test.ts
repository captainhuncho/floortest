import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest } from "./request-scope";

// Adding your own track to Projects needs no separate rights tick (owner, 16 Nov): the accepted Terms cover it, and
// the route refuses anyone who hasn't accepted the current Terms.
process.env.DATA_DIR = testDataDir("ft-own-upload-terms-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;
delete process.env.VERCEL_ENV;

test("own upload to Projects: refused with termsNeeded before the Terms tick, then starts without any rights field", async () => {
  const { q, now } = await import("../src/lib/db");
  const { createSession } = await import("../src/lib/auth");
  const { currentTerms, recordAcceptance } = await import("../src/lib/terms-record");
  const { POST } = await import("../src/app/api/music/upload/route");
  const email = "own@example.test";
  const id = Number((await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at) VALUES (?, 'h', 'Own', 'ownup', 'pro', 'dj', 'UTC', ?, ?) RETURNING id",
    email, now(), now(),
  ))!.id);
  const jar = new Map<string, string>();
  await inRequest(jar, "203.0.113.7", () => createSession(id));
  const start = () =>
    inRequest(jar, "203.0.113.7", () =>
      POST(new Request("http://localhost/api/music/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: "mine.wav", size: 1000, title: "Mine", artist: "Me", genre: "House" }) })),
      { dropAfter: true },
    ).then((r) => r.answer as Response);

  const before = await start();
  assert.equal(before.status, 403);
  assert.equal((await before.json()).termsNeeded, true);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ?", id), 0, "nothing held before the tick");

  await recordAcceptance({ userId: id, email }, "Own", await currentTerms());
  const after = await start();
  assert.equal(after.status, 200, JSON.stringify(await after.clone().json()));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ?", id), 1, "started with no rights field");
});
