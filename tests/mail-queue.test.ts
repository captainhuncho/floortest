import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { failOnce } from "./fail-once";

// A throwaway local database and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = testDataDir("ft-mail-queue-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
process.env.CRON_SECRET = "cron-test-secret";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;
delete process.env.ADMIN_EMAILS;

type Call = { key: string; to: string };
const calls: Call[] = [];
/** The next this-many sends time out, as Resend did when it answered after our 5 s limit. */
let timeouts = 0;
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  calls.push({ key: (init?.headers as Record<string, string>)["Idempotency-Key"], to: body.to });
  if (timeouts > 0) {
    timeouts--;
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }
  return new Response(JSON.stringify({ id: `em-${calls.length}` }), { status: 200 });
}) as typeof fetch;

const auth = { authorization: "Bearer cron-test-secret" };

async function receiver(handle: string) {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, notify_submissions) VALUES (?, 'h', 'Rae Desk', ?, 'pro', 'UTC', ?, ?, 'digest') RETURNING id",
    `${handle}@x.io`,
    handle,
    t,
    t,
  ))!.id;
  const s = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'Sam', ?) RETURNING id", uid, `snd-${handle}@x.io`, t))!.id;
  for (const n of [1, 2])
    await q.run(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,'A',?,'k','a.wav','audio/wav',1,?)",
      uid,
      s,
      `Track ${n}`,
      `tok-${handle}-${n}`,
      t,
    );
  return uid;
}

const status = async (id: number) => {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ status: string; payload: string | null }>("SELECT status, payload FROM outbox WHERE id = ?", id))!;
};

test("an email that can't be read doesn't block the ones queued after it", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, drainOutbox } = await import("../src/lib/mail");
  const bad = await queueMail({ userId: null, to: "bad@x.io", subject: "Unreadable", body: "x" });
  const good = await queueMail({ userId: null, to: "good@x.io", subject: "Fine", body: "y" });
  // Sealed with an old key (APP_SECRET changed) or damaged: it can never be opened.
  await q.run("UPDATE outbox SET payload = 'not.a.sealed-payload' WHERE id = ?", bad);

  await drainOutbox();
  assert.equal((await status(good)).status, "sent", "the next email still goes");
  assert.deepEqual({ ...(await status(bad)) }, { status: "failed (unreadable)", payload: null }, "closed, and its sealed text erased");
  assert.ok(await q.get("SELECT 1 FROM incidents WHERE kind = 'email_failed' AND message LIKE '%couldn''t be read%'"), "reported");
  await drainOutbox();
  assert.equal(calls.filter((c) => c.to === "good@x.io").length, 1);
});

test("an email stuck mid-send with every attempt used is closed, not sent again", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver, drainOutbox } = await import("../src/lib/mail");
  const id = await queueMail({ userId: null, to: "stuck@x.io", subject: "Stuck", body: "z" });
  await q.run("UPDATE outbox SET status = 'sending', attempts = 5, last_attempt_at = 0 WHERE id = ?", id);

  assert.equal(await deliver(id), "sending", "no sixth attempt");
  await drainOutbox();
  assert.deepEqual({ ...(await status(id)) }, { status: "failed (stuck)", payload: null });
  assert.equal(calls.filter((c) => c.to === "stuck@x.io").length, 0);
  assert.ok(await q.get("SELECT 1 FROM incidents WHERE kind = 'email_failed' AND message LIKE '%stuck%'"));
});

test("a Resend timeout during a digest is retried with the same key, never sent as a second email", async () => {
  const { q } = await import("../src/lib/db");
  const { sendDigest } = await import("../src/lib/notify");
  const { drainOutbox } = await import("../src/lib/mail");
  const uid = await receiver("timeout");

  assert.equal(await sendDigest(uid), 2, "both tracks are in it");
  const rows = () => q.all<{ id: number; status: string }>("SELECT id, status FROM outbox WHERE user_id = ? ORDER BY id", uid);
  assert.equal((await rows()).length, 1);
  timeouts = 1;
  await drainOutbox();
  assert.equal((await rows())[0].status, "queued", "waits to try again");

  assert.equal(await sendDigest(uid), 0, "the next run finds nothing new to send");
  await q.run("UPDATE outbox SET next_at = 0 WHERE user_id = ?", uid); // time passes
  await drainOutbox();
  const out = await rows();
  assert.equal(out.length, 1, "one email, however many tries");
  assert.equal(out[0].status, "sent");
  const tries = calls.filter((c) => c.to === "timeout@x.io");
  assert.equal(tries.length, 2);
  assert.equal(tries[0].key, tries[1].key, "same idempotency key, so Resend sends it once");
});

test("a digest's email exists exactly when its tracks are marked as emailed", async () => {
  const { q } = await import("../src/lib/db");
  const { sendDigest } = await import("../src/lib/notify");
  const uid = await receiver("together");
  const restore = failOnce(q as never, /INSERT INTO outbox/);
  try {
    await assert.rejects(sendDigest(uid));
  } finally {
    restore();
  }
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ? AND receiver_notified_at IS NOT NULL", uid), 0, "nothing marked without its email");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE user_id = ?", uid), 0);
  assert.equal(await sendDigest(uid), 2, "the next run sends it");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE user_id = ?", uid), 1);
});

test("one failing step of the daily job doesn't stop the steps after it", async () => {
  const { q } = await import("../src/lib/db");
  const { GET } = await import("../src/app/api/cron/digest/route");
  const all = q.all;
  let armed = true;
  q.all = (async (sql: string, ...args: unknown[]) => {
    if (armed && /nudged_at IS NULL/.test(sql)) {
      armed = false;
      throw new Error("Connection terminated unexpectedly");
    }
    return all.call(q, sql, ...(args as never[]));
  }) as typeof q.all;
  try {
    const res = await GET(new Request("http://localhost/api/cron/digest", { headers: auth }));
    assert.equal(res.status, 500, "the run reports failure");
    const body = await res.json();
    assert.ok(body.nudges?.error, "the failed step says so");
    assert.equal(typeof body.playedOutReminders, "number", "a later step still ran");
    assert.equal(typeof body.adminDigest, "boolean", "and the last one");
  } finally {
    q.all = all;
  }
  const run = JSON.parse((await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'last_run_digest'"))!.value);
  assert.equal(run.ok, false);
  assert.ok(await q.get("SELECT 1 FROM incidents WHERE kind = 'cron_failed' AND message LIKE '%nudges%'"), "the alert names the step");
});

test("the mail job needs the secret, sends what's due, and never runs twice at once", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail } = await import("../src/lib/mail");
  const { GET } = await import("../src/app/api/cron/mail/route");
  const id = await queueMail({ userId: null, to: "queued@x.io", subject: "Waiting", body: "w" });

  assert.equal((await GET(new Request("http://localhost/api/cron/mail"))).status, 401);
  assert.equal((await status(id)).status, "queued");

  await q.run("INSERT INTO app_state (key, value, updated_at) VALUES ('lease_mail', 'another run', ?)", Date.now());
  assert.deepEqual(await (await GET(new Request("http://localhost/api/cron/mail", { headers: auth }))).json(), { skipped: "already running" });
  assert.equal((await status(id)).status, "queued");
  await q.run("DELETE FROM app_state WHERE key = 'lease_mail'");

  const res = await GET(new Request("http://localhost/api/cron/mail", { headers: auth }));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).sent >= 1);
  assert.equal((await status(id)).status, "sent");
  assert.ok(await q.get("SELECT 1 FROM app_state WHERE key = 'last_run_mail'"), "the run is recorded for Admin → Jobs");
});
