import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-stale-desk-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// A desk cookie for a team the person can't open any more (removed, seat paused, account suspended) is "stale": the
// change they were making must not quietly land on their own desk instead.
test("a team desk the person lost is reported as stale, not silently swapped for their own", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { resolveDesk } = await import("../src/lib/team-desk");
  const t = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", t);
  const user = async (handle: string, plan = "free") =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, ?, 'UTC', ?, ?) RETURNING id",
      `${handle}@stale.io`, handle, handle, plan, t, t,
    ))!.id;
  const label = await user("stalelabel", "pro");
  const ama = await user("staleama");
  const person = async (id: number) => ({ ...(await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!, actor_id: id, actor_name: "", role: "owner" as const }) as never;
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, ama, t);

  const onTeam = await resolveDesk(await person(ama), label);
  assert.equal(onTeam.stale, false);
  assert.equal(onTeam.user.id, label, "works on the team's desk");
  assert.equal(onTeam.user.actor_id, ama);

  assert.deepEqual((await resolveDesk(await person(ama), NaN)).stale, false, "no cookie: own desk, nothing stale");
  assert.equal((await resolveDesk(await person(ama), ama)).stale, false, "own id: own desk");

  await q.run("DELETE FROM account_members WHERE account_id = ? AND user_id = ?", label, ama);
  const removed = await resolveDesk(await person(ama), label);
  assert.equal(removed.stale, true, "removed from the team");
  assert.equal(removed.user.id, ama, "reading falls back to their own desk");

  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, ama, t);
  await q.run("UPDATE users SET suspended_at = ? WHERE id = ?", t, label);
  assert.equal((await resolveDesk(await person(ama), label)).stale, true, "the team's account is suspended");
});

test("a change made from a stale desk is stopped and the person told", () => {
  const src = fs.readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function requireUser")).split("\nexport ")[0];
  assert.match(body, /stale/);
  assert.match(body, /desk=ended/);
});

// API routes are called directly (fetch, the app), so a change sent from a lost team desk must be refused there too,
// with one clear JSON error, never made on the person's own desk instead.
test("a desk API change from a stale desk is refused with a 409; one from a live desk goes through", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { resolveDesk, refuseStaleChange } = await import("../src/lib/team-desk");
  const t = Date.now();
  const user = async (handle: string, plan = "free") =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, ?, 'UTC', ?, ?) RETURNING id",
      `${handle}@stale.io`, handle, handle, plan, t, t,
    ))!.id;
  const label = await user("apilabel", "pro");
  const ama = await user("apiama");
  const person = async (id: number) => ({ ...(await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!, actor_id: id, actor_name: "", role: "owner" as const }) as never;
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, ama, t);

  const live = refuseStaleChange(await resolveDesk(await person(ama), label));
  assert.ok(!(live instanceof Response), "a live team desk is used");
  assert.equal((live as { id: number }).id, label);
  const own = refuseStaleChange(await resolveDesk(await person(ama), NaN));
  assert.equal((own as { id: number }).id, ama, "no desk cookie: own desk");

  await q.run("DELETE FROM account_members WHERE account_id = ? AND user_id = ?", label, ama);
  const refused = refuseStaleChange(await resolveDesk(await person(ama), label));
  assert.ok(refused instanceof Response, "a lost desk is refused");
  assert.equal(refused.status, 409);
  const body = await refused.json();
  assert.equal(body.deskEnded, true);
  assert.match(body.error, /desk/i);
});

test("every desk API route that changes something uses the stale-desk guard, not currentUser()", () => {
  const src = fs.readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function currentDeskForChange")).split("\nexport ")[0];
  assert.match(body, /refuseStaleChange/);
  assert.match(body, /DESK_COOKIE/, "the lost desk's cookie is cleared");
  const route = fs.readFileSync(new URL("../src/app/api/tracks/[id]/listened/route.ts", import.meta.url), "utf8");
  assert.match(route, /currentDeskForChange\(\)/);
  assert.doesNotMatch(route, /currentUser\(\)/);
});
