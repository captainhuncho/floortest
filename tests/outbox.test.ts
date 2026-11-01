import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = testDataDir("ft-outbox-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

type Call = { key: string; to: string; text: string };
const calls: Call[] = [];
let failing = 0;
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  calls.push({ key: (init?.headers as Record<string, string>)["Idempotency-Key"], to: body.to, text: body.text });
  if (failing > 0) {
    failing--;
    return new Response("down", { status: 503 });
  }
  return new Response(JSON.stringify({ id: `em-${calls.length}` }), { status: 200 });
}) as typeof fetch;

test("an email is queued with its change: rolled back together, sent once, retried with the same key, secrets hidden", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver, drainOutbox, sendMail, HIDDEN } = await import("../src/lib/mail");
  const mail = (to: string) => ({ userId: null, to, subject: "Your receipt", body: "Open https://floortest.app/receipt/SECRETTOKEN123", secrets: ["SECRETTOKEN123"] });

  // The change fails: its email never existed.
  await assert.rejects(q.tx(async (db) => {
    await queueMail(mail("rollback@x.io"), db);
    throw new Error("the change failed");
  }));
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE to_email = 'rollback@x.io'"), 0);

  // Queued: the stored copy hides the private link; the sealed text doesn't show it either.
  const id = await q.tx((db) => queueMail(mail("a@x.io"), db));
  const stored = (await q.get<{ body: string; payload: string; status: string }>("SELECT body, payload, status FROM outbox WHERE id = ?", id))!;
  assert.equal(stored.status, "queued");
  assert.ok(stored.body.includes(HIDDEN) && !stored.body.includes("SECRETTOKEN123"));
  assert.ok(!stored.payload.includes("SECRETTOKEN123"));

  // The provider is down: it waits and tries again later, with the same idempotency key.
  failing = 1;
  assert.equal(await deliver(id), "queued (retrying)");
  await q.run("UPDATE outbox SET next_at = 0 WHERE id = ?", id); // time passes
  assert.deepEqual(await drainOutbox(), { due: 1, sent: 1 });
  const sentTo = calls.filter((c) => c.to === "a@x.io");
  assert.equal(sentTo.length, 2);
  assert.equal(sentTo[0].key, sentTo[1].key, "one key for every attempt, so the provider never sends it twice");
  assert.ok(sentTo[1].text.includes("SECRETTOKEN123"), "the real email still carries the link");
  const done = (await q.get<{ status: string; payload: string | null; attempts: number }>("SELECT status, payload, attempts FROM outbox WHERE id = ?", id))!;
  assert.deepEqual({ ...done }, { status: "sent", payload: null, attempts: 2 }, "the sealed text is gone once it's sent");
  assert.equal(await deliver(id), "sent", "sending again does nothing");
  assert.equal(calls.filter((c) => c.to === "a@x.io").length, 2);

  // A crash in the middle of a send: picked up again later, same key.
  const cut = await queueMail(mail("b@x.io"));
  await q.run("UPDATE outbox SET status = 'sending', attempts = 1, last_attempt_at = 0 WHERE id = ?", cut);
  await drainOutbox();
  assert.equal((await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", cut))!.status, "sent");

  // sendMail: one attempt, the answer straight back, no retry behind the caller's back.
  failing = 1;
  assert.equal(await sendMail(mail("c@x.io")), "failed (503)");
  const once = (await q.get<{ status: string; payload: string | null }>("SELECT status, payload FROM outbox WHERE to_email = 'c@x.io'"))!;
  assert.deepEqual({ ...once }, { status: "failed (503)", payload: null });
  assert.ok(await q.get("SELECT 1 FROM incidents WHERE kind = 'email_failed'"), "a final failure is reported");
});

test("a sender's Downloaded email exists once, with the change", async () => {
  const { q } = await import("../src/lib/db");
  const { markDownloaded } = await import("../src/lib/review");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('r@x.io','h','R','rdesk','pro','UTC',?,?) RETURNING id",
    t, t,
  ))!.id;
  const s = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'snd@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  const track = (await q.get(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','tok-dl-123','k','a.wav','audio/wav',1,?) RETURNING *",
    uid, s, t,
  ))! as never;
  const user = { id: uid, actor_id: uid, name: "R" } as never;
  await markDownloaded(user, track);
  await markDownloaded(user, track);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE to_email = 'snd@x.io'"), 1);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM events WHERE track_id = (SELECT id FROM tracks WHERE token = 'tok-dl-123') AND type = 'downloaded'"), 1);
});
