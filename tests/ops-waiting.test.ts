import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-ops-waiting-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Ops → Overview → "Waiting on me" (ops redesign B, 1 Nov): one list of what waits for a person, only what the viewer may
// act on, oldest (soonest due) first, capped, with full counts for the rail.
test("Waiting on me lists only what the viewer may act on, oldest first, capped, with full counts", async () => {
  const { q } = await import("../src/lib/db");
  const { recordRun } = await import("../src/lib/cron");
  const { waitingOnMe, DUE_MS, LIMIT, KIND_AREA } = await import("../src/lib/ops-waiting");
  const { ROLE_PERMS } = await import("../src/lib/ops-perms");
  const t = Date.now() - 86_400_000;

  const user = (handle: string, extra = "") =>
    q.get<{ id: number }>(`INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at${extra ? ", identity_status, identity_submitted_at" : ""}) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?${extra ? ", 'pending', ?" : ""}) RETURNING id`, `${handle}@wait.io`, handle, handle, t, ...(extra ? [t + 5_000] : []));
  const msg = (topic: string, at: number, name = "Ina") => q.run("INSERT INTO contact_messages (name, email, topic, message, created_at) VALUES (?, 'ina@wait.io', ?, 'hello', ?)", name, topic, at);

  await msg("Something else", t + 1_000);
  await msg("Feedback: idea", t + 2_000);
  await msg("Privacy request", t + 3_000);
  await user("verifyme", "pending");
  const asker = (await user("asker"))!.id;
  await q.run("INSERT INTO plan_requests (user_id, plan, kind, created_at) VALUES (?, 'pro', 'upgrade', ?)", asker, t + 6_000);
  await q.run("INSERT INTO takedowns (track_label, claimant, claimant_email, created_at) VALUES ('Selah – Low Orbit', 'Label X', 'x@label.io', ?)", t + 7_000);
  await q.run("INSERT INTO incidents (kind, message, created_at) VALUES ('cron_failed', 'Email queue job failed', ?)", t + 8_000);
  await q.run("INSERT INTO incidents (kind, message, created_at) VALUES ('upload_rejected', 'A sender sent a .exe', ?)", t + 9_000);
  await recordRun("mail", t + 10_000, false, { error: "down" });

  const superAdmin = { super: true as const, role: "super" as const, perms: new Set<never>() };
  const all = await waitingOnMe(superAdmin);
  assert.deepEqual(
    all.items.map((i) => i.kind),
    ["inbox", "privacy", "verification", "plan_request", "takedown", "incident", "job_failed"],
    "every kind, oldest first; no feedback and no rejected upload",
  );
  assert.equal(all.items[0].due_at - all.items[0].created_at, DUE_MS);
  assert.equal(all.items.find((i) => i.kind === "takedown")!.area, KIND_AREA.takedown);
  assert.equal(all.items.find((i) => i.kind === "job_failed")!.id, "mail");
  assert.deepEqual(all.counts, { inbox: 1, privacy: 1, verification: 1, verification_proposal: 0, takedown: 1, plan_request: 1, incident: 1, job_failed: 1 });

  // A support role: its own queues only, nothing it can't open is even read.
  const care = { super: false as const, role: "care" as const, perms: new Set(ROLE_PERMS.care) };
  const mine = await waitingOnMe(care);
  assert.deepEqual([...new Set(mine.items.map((i) => i.kind))].sort(), ["inbox", "verification"]);
  assert.deepEqual(Object.keys(mine.counts).sort(), ["inbox", "verification"]);

  // Capped at LIMIT items, counts still whole.
  for (let i = 0; i < LIMIT + 10; i++) await msg("Something else", t + 20_000 + i, `Bulk ${i}`);
  const busy = await waitingOnMe(superAdmin);
  assert.equal(busy.items.length, LIMIT);
  assert.equal(busy.counts.inbox, LIMIT + 11);
});
