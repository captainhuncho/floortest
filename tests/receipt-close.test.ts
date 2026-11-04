import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database, storage folder and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-receipt-close-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const at = (d: number) => T0 + d * DAY;
const base = { created_at: T0, played_out_at: null, stems_requested_at: null, stems_sent: null };

/** A small valid 16-bit mono WAV. */
function wav() {
  const n = 8000;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

// Receipt links close 90 days after the track's final outcome (owner, 4 Nov: "go 90", then "same clock for all, plus
// the stems hold"): played out or upload + 90 days, whichever is first, for every track whatever the receiver decided.
test("the clock: open until day 90, read-only until day 180, then closed, at the exact instant", async () => {
  const { finalAt, receiptLife, receiptClosesAt, RECEIPT_FINAL_DAYS, RECEIPT_CLOSE_DAYS } = await import("../src/lib/receipt-life");
  assert.equal(RECEIPT_FINAL_DAYS, 90);
  assert.equal(RECEIPT_CLOSE_DAYS, 90);
  const f = finalAt(base);
  assert.equal(f, at(90));
  assert.equal(receiptLife(base, f - 1), "open");
  assert.equal(receiptLife(base, f), "read-only", "read-only at the very instant of the outcome");
  assert.equal(receiptLife(base, f + 90 * DAY - 1), "read-only");
  assert.equal(receiptLife(base, f + 90 * DAY), "closed", "closed at the very instant 90 days later");
  assert.equal(receiptClosesAt(base), at(180));
  const expected = { 1: "open", 89: "open", 91: "read-only", 179: "read-only", 181: "closed" } as const;
  for (const [day, life] of Object.entries(expected)) assert.equal(receiptLife(base, at(Number(day))), life, `day ${day}`);
});

test("played out is final at once, and closes 90 days after; a later play-out doesn't move the clock", async () => {
  const { receiptLife } = await import("../src/lib/receipt-life");
  const played = { ...base, played_out_at: at(3) };
  assert.equal(receiptLife(played, at(3) - 1), "open");
  assert.equal(receiptLife(played, at(3)), "read-only");
  assert.equal(receiptLife(played, at(93) - 1), "read-only");
  assert.equal(receiptLife(played, at(93)), "closed");
  assert.equal(receiptLife({ ...base, played_out_at: at(120) }, at(180)), "closed");
});

test("the stems hold: asked for and none sent keeps it open; a malformed list reads as nothing sent", async () => {
  const { receiptLife } = await import("../src/lib/receipt-life");
  const asked = { ...base, stems_requested_at: at(10) };
  assert.equal(receiptLife(asked, at(91)), "open");
  assert.equal(receiptLife(asked, at(400)), "open");
  const sent = { ...asked, stems_sent: JSON.stringify(["Drums.wav"]) };
  assert.equal(receiptLife(sent, at(91)), "read-only", "once a stem lands the normal clock applies");
  assert.equal(receiptLife(sent, at(181)), "closed");
  for (const bad of ["{}", "[1]", "null", "not json", ""]) assert.equal(receiptLife({ ...asked, stems_sent: bad }, at(91)), "open", `stems_sent ${JSON.stringify(bad)}`);
});

type Extra = Partial<Record<"decision" | "decided_at" | "deleted_at" | "played_at" | "played_out_at" | "stems_sent", unknown>>;

/** A receiver with stems on, a sender and one track `days` old, with its receipt token stored as the live site does. */
async function track(handle: string, days: number, extra: Extra = {}, { stems = true } = {}) {
  const { q } = await import("../src/lib/db");
  const R = await import("../src/lib/receipt-token");
  const created = Date.now() - days * DAY;
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', 'R', ?, 'pro', 'UTC', ?) RETURNING id", `${handle}@x.io`, handle, created))!.id;
  await q.run("INSERT INTO feature_switches (feature, plans, users, updated_at) VALUES ('stems', '[]', ?, ?) ON CONFLICT (feature) DO UPDATE SET users = (feature_switches.users::jsonb || excluded.users::jsonb)::text", JSON.stringify([uid]), created);
  const sid = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", uid, `${handle}-s@x.io`, created))!.id;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, original_name, mime, size, created_at, stems_requested_at) VALUES (?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?, ?) RETURNING id",
    uid, sid, created, stems ? created : null,
  ))!.id;
  for (const [k, v] of Object.entries(extra)) await q.run(`UPDATE tracks SET ${k} = ? WHERE id = ?`, v, id);
  const token = R.newReceiptToken();
  await q.tx((db) => R.storeReceiptToken(db, id, token));
  return { id, token, uid };
}

const caught = (p: Promise<unknown>) => p.then(() => ({ accepted: true }), (e: Error & { status?: number }) => ({ status: e.status, error: e.message }));

/** Every answer the sender can get about a receipt: its life, live status, stems start and finish, and artwork. */
async function answers(token: string, ip: string) {
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const { receiptPulse } = await import("../src/lib/pulse");
  const S = await import("../src/lib/stems");
  const { attachTrackArt } = await import("../src/lib/track-art");
  return {
    life: (await receiptLifeByToken(token))?.life ?? null,
    pulse: await receiptPulse(token),
    start: await caught(S.startStemUpload(token, "bass.wav", 1000, ip)),
    complete: await caught(S.completeStemUpload(token, "no-such-upload")),
    art: await attachTrackArt(token, { type: "image/png", size: 1000 }).then((r) => ({ status: r.status, error: (r.body as { error?: string }).error ?? null })),
  };
}

const SENT = JSON.stringify(["Keys.wav"]);

test("the decision can't show: a kept track and a passed, deleted one of the same age answer the same, at every age", async () => {
  for (const [i, days] of [0, 89, 91, 179, 181].entries()) {
    const when = Date.now() - days * DAY;
    const common = { played_at: when + 60_000, stems_sent: SENT };
    const kept = await track(`dk${days}`, days, { ...common, decision: "kept", decided_at: when + 120_000 });
    const passed = await track(`dp${days}`, days, { ...common, decision: "passed", decided_at: when + 120_000, deleted_at: Math.min(Date.now(), when + 30 * DAY) });
    assert.deepEqual(await answers(passed.token, `6.6.${i}.2`), await answers(kept.token, `6.6.${i}.1`), `day ${days}`);
  }
});

test("a closed receipt answers exactly as an unknown token: stems routes, live status, stems, artwork and the code actions", async () => {
  const closed = await track("closed1", 200, { stems_sent: SENT });
  const unknown = "no-such-receipt-token-0001";
  const { life: lifeClosed, ...a } = await answers(closed.token, "8.8.1.1");
  const { life: lifeUnknown, ...b } = await answers(unknown, "8.8.1.2");
  assert.equal(lifeClosed, "closed");
  assert.equal(lifeUnknown, null);
  assert.deepEqual(a, b);
  assert.equal(a.pulse, "");
  // The stems routes, the receipt page and its code actions need a request (sign-in, cookies): e2e/receipt-proof.spec.ts
  // checks them against a seeded closed receipt.
});

test("by token: open on day 89 by the clock alone, read-only on day 91, closed on day 181; stems stop once read-only", async () => {
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const S = await import("../src/lib/stems");
  // No stems request: day 89 is open because of the clock, not the hold.
  const d89 = await track("rc89", 89, {}, { stems: false });
  const d91 = await track("rc91", 91, { stems_sent: SENT });
  const d181 = await track("rc181", 181, { stems_sent: SENT });
  const held = await track("rchold", 120);
  assert.equal((await receiptLifeByToken(d89.token))?.life, "open");
  assert.equal((await receiptLifeByToken(d91.token))?.life, "read-only");
  assert.equal((await receiptLifeByToken(d181.token))?.life, "closed");
  assert.equal((await receiptLifeByToken(held.token))?.life, "open", "stems asked for, none sent");
  assert.equal(await receiptLifeByToken("no-such-token"), null);
  assert.deepEqual(await caught(S.startStemUpload(d91.token, "bass.wav", 1000, "9.9.9.2")), { status: 403, error: "This receipt doesn't take stems any more." });
  assert.deepEqual(await caught(S.startStemUpload(d181.token, "bass.wav", 1000, "9.9.9.3")), { status: 404, error: "This track is no longer available." });
});

test("the stems hold doesn't lose stems: past day 90, three started at once all land, one through the held batch", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const S = await import("../src/lib/stems");
  const store = await storage();
  const held = await track("rcthree", 120);
  const started: string[] = [];
  for (const name of ["drums.wav", "bass.wav", "keys.wav"]) {
    const { uploadId } = await S.startStemUpload(held.token, name, wav().length, `7.7.7.${started.length + 1}`);
    const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", uploadId))!.file_key;
    await store.put(key, wav(), "audio/wav");
    started.push(uploadId);
  }
  // The first lands and ends the hold: the receipt is read-only from now on, so no new upload starts...
  assert.equal((await S.completeStemUpload(held.token, started[0])).name, "drums.wav");
  assert.equal((await receiptLifeByToken(held.token))?.life, "read-only");
  assert.deepEqual(await caught(S.startStemUpload(held.token, "more.wav", wav().length, "7.7.7.9")), { status: 403, error: "This receipt doesn't take stems any more." });
  // ...but the others started while it was open still finish: one from the sender, one as the held batch completes it.
  assert.equal((await S.completeStemUpload(held.token, started[1])).name, "bass.wav");
  assert.equal((await S.completeStemUpload(held.token, started[2], { from: "batch" })).name, "keys.wav");
  const row = (await q.get<{ stems_sent: string }>("SELECT stems_sent FROM tracks WHERE id = ?", held.id))!;
  assert.deepEqual(S.stemsSent(row).sort(), ["bass.wav", "drums.wav", "keys.wav"]);
});

test("a stem started while the receipt was open still lands after it closes; an unknown upload gets the unknown answer", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const S = await import("../src/lib/stems");
  const store = await storage();
  // Started while the stems hold kept it open (none sent yet); then another stem landed, so this 200-day-old receipt
  // is closed by the time this one finishes. The upload row is what startStemUpload made while it was open.
  const t = await track("rclate", 200);
  const { uploadId } = await S.startStemUpload(t.token, "late.wav", wav().length, "4.4.4.1");
  const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", uploadId))!.file_key;
  await store.put(key, wav(), "audio/wav");
  await q.run("UPDATE tracks SET stems_sent = ? WHERE id = ?", SENT, t.id);
  assert.equal((await receiptLifeByToken(t.token))?.life, "closed");
  assert.equal((await S.completeStemUpload(t.token, uploadId, { from: "batch" })).name, "late.wav");
  assert.deepEqual(await caught(S.completeStemUpload(t.token, "no-such-upload")), { status: 404, error: "This track is no longer available." });
});

test("artwork: a deleted track answers as a live one and never gets artwork", async () => {
  const { q } = await import("../src/lib/db");
  const { attachTrackArt } = await import("../src/lib/track-art");
  const live = await track("artlive", 0);
  const gone = await track("artgone", 0, { deleted_at: Date.now() });
  const a = await attachTrackArt(live.token, { type: "image/png", size: 1000 });
  const b = await attachTrackArt(gone.token, { type: "image/png", size: 1000 });
  assert.equal(b.status, a.status, JSON.stringify([a, b]));
  assert.deepEqual(Object.keys(b.body), Object.keys(a.body));
  const da = await attachTrackArt(live.token, { done: true });
  const dg = await attachTrackArt(gone.token, { done: true });
  assert.deepEqual({ s: dg.status, e: (dg.body as { error?: string }).error }, { s: da.status, e: (da.body as { error?: string }).error });
  assert.equal((await q.get<{ art_key: string | null }>("SELECT art_key FROM tracks WHERE id = ?", gone.id))!.art_key, null);
});

test("sender history still lists a track whose receipt has closed", async () => {
  const { q } = await import("../src/lib/db");
  const { sentBy } = await import("../src/lib/sent");
  const { receiptLifeByToken } = await import("../src/lib/receipt");
  const old = await track("rchist", 400, { deleted_at: Date.now() - 300 * DAY, stems_sent: SENT });
  assert.equal((await receiptLifeByToken(old.token))?.life, "closed");
  const t = Date.now();
  const me = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('rchist-s@x.io', 'h', 'S', 'rchists', 'free', 'UTC', ?, ?) RETURNING id", t, t))!;
  const rows = await sentBy({ id: me.id, email: "rchist-s@x.io", email_verified_at: t });
  assert.ok(rows.some((r) => r.id === old.id));
});
