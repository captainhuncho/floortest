import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-caps-race-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// Seats and the beta collection limit are checked and taken in one step, with the desk row locked, so two clicks at
// the same instant can't both squeeze into the last place.
test("two invites at once can't take more seats than the plan has", async () => {
  const { q } = await import("../src/lib/db");
  const T = await import("../src/lib/account-members");
  const t = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", t);
  const label = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, totp_enabled_at, created_at) VALUES ('race@cap.io', 'h', 'Race', 'racelabel', 'pro', 'UTC', ?, ?, ?) RETURNING id",
    t, t, t,
  ))!.id;
  const owner = { id: label, role: "owner" as const, actor_id: label, email: "race@cap.io", totp_enabled_at: t };
  assert.equal(await T.seatsFor(label), 2, "Pro: you + 1");
  const results = await Promise.allSettled([T.inviteToTeam(owner, "one@cap.io", "member"), T.inviteToTeam(owner, "two@cap.io", "member")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "one invite fits");
  assert.match(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /All your seats/);
  assert.equal(await T.seatsUsed(label), 2);
});

test("two new collections at once can't go past the beta limit", async () => {
  const { q } = await import("../src/lib/db");
  const { addCollection, BETA_COLLECTIONS } = await import("../src/lib/desk");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('col@cap.io', 'h', 'C', 'colrace', 'free', 'UTC', ?) RETURNING id", t))!.id;
  await addCollection(desk, "One");
  const made = await Promise.all([addCollection(desk, "Two"), addCollection(desk, "Three")]);
  assert.equal(made.filter(Boolean).length, 1, "only one fits");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", desk), BETA_COLLECTIONS);
});
