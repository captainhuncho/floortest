import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-ops-signals-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Ops → Moderation's queue (ops redesign B, owner 1 Nov): only tracks with a real signal; Keep after a signal clears it,
// a newer signal brings it back; a held upload is listed once its virus check is late.
test("moderation signals: takedown, blocked sender, late scan; Keep clears, a newer signal brings it back", async () => {
  const { q } = await import("../src/lib/db");
  const { moderationSignals, LATE_SCAN_MS } = await import("../src/lib/ops-signals");
  const now = Date.now();
  const t = now - 86_400_000;

  const user = async (handle: string) => (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?) RETURNING id", `${handle}@sig.io`, handle, handle, t))!.id;
  const sender = async (owner: number, email: string, blockedAt: number | null = null) =>
    (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at, blocked_at) VALUES (?, ?, 'S', ?, ?) RETURNING id", owner, email, t, blockedAt))!.id;
  const track = async (owner: number, sid: number, title: string, at: number) =>
    (await q.get<{ id: number }>("INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,'Artist',?,?,'b.wav','audio/wav',1,?) RETURNING id", owner, sid, title, `tok-${title}`, `k/${title}`, at))!.id;

  const ama = await user("ama");
  const kofi = await user("kofi");
  // An open takedown on one of Ama's tracks; a rejected claim on another is no signal.
  const claimed = await track(ama, await sender(ama, "label@x.io"), "Claimed", t + 1_000);
  await q.run("INSERT INTO takedowns (track_id, track_label, claimant, claimant_email, created_at) VALUES (?, 'Artist – Claimed', 'Label X', 'x@label.io', ?)", claimed, t + 2_000);
  const other = await track(ama, await sender(ama, "fine@x.io"), "Fine", t + 1_500);
  await q.run("INSERT INTO takedowns (track_id, track_label, claimant, claimant_email, status, created_at) VALUES (?, 'Artist – Fine', 'Y', 'y@y.io', 'rejected', ?)", other, t + 2_500);
  // spam@ was blocked by Ama (any case); their newest track anywhere is the one to look at (sent to Kofi).
  await track(ama, await sender(ama, "SPAM@x.io", t + 3_000), "Old spam", t + 2_800);
  const newest = await track(kofi, await sender(kofi, "spam@x.io"), "New spam", t + 4_000);
  // Held uploads: one past the late mark, one fresh.
  const held = (id: string, at: number) => q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at, held_at) VALUES (?, ?, ?, 'wav', 1, ?, '1.2.3.4', ?, ?)", id, kofi, `k/${id}`, JSON.stringify({ title: `Held ${id}`, email: "s@x.io" }), at, at);
  await held("late1", now - LATE_SCAN_MS - 60_000);
  await held("fresh1", now - 60_000);

  const first = await moderationSignals(now);
  assert.deepEqual(first.counts, { takedown: 1, blocked_sender: 1, late_scan: 1 });
  assert.deepEqual(first.signals.map((s) => [s.kind, s.track_id]), [
    ["late_scan", null],
    ["blocked_sender", newest],
    ["takedown", claimed],
  ], "newest signal first; the blocked sender points at their newest track");
  assert.match(first.signals.find((s) => s.kind === "blocked_sender")!.subtitle, /blocked by 1 receiver · newest to @kofi/);
  assert.equal(first.signals.find((s) => s.kind === "late_scan")!.title, "Held late1");
  // What the queue words each signal from: whose desk, who the signal names, how many blocks.
  assert.deepEqual(first.signals.map((s) => [s.handle, s.who, s.count]), [["kofi", "s@x.io", 1], ["kofi", "spam@x.io", 1], ["ama", "Label X", 1]]);

  // Keep after the signal clears it; the queue drops both kept tracks.
  await q.run("UPDATE tracks SET ops_reviewed_at = ? WHERE id IN (?, ?)", t + 5_000, claimed, newest);
  const kept = await moderationSignals(now);
  assert.deepEqual(kept.signals.map((s) => s.kind), ["late_scan"]);

  // A newer block (Kofi blocks them too) brings the sender back, now blocked by 2.
  await q.run("UPDATE senders SET blocked_at = ? WHERE user_id = ? AND email = 'spam@x.io'", t + 6_000, kofi);
  const again = await moderationSignals(now);
  assert.deepEqual(again.signals.map((s) => s.kind), ["late_scan", "blocked_sender"]);
  assert.match(again.signals[1].subtitle, /blocked by 2 receivers/);
  assert.equal(again.signals[1].count, 2);
});
