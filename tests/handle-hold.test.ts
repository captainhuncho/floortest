import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-handle-hold-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const DAY = 86_400_000;

async function setup() {
  const { q } = await import("../src/lib/db");
  const accounts = await import("../src/lib/accounts");
  const make = async (email: string, handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', 'DJ', ?, 'pro', 'UTC', ?, ?) RETURNING id",
      email, handle, Date.now(), Date.now(),
    ))!.id;
  /** Moves a rename into the past, as if `days` had gone by. */
  const age = (handle: string, days: number) =>
    q.run("UPDATE handle_history SET created_at = created_at - ?, forward_until = forward_until - ?, expires_at = expires_at - ? WHERE old_handle = ?", days * DAY, days * DAY, days * DAY, handle);
  return { q, ...accounts, make, age };
}

test("an old link forwards for 14 days but stays reserved for its owner for 365", async () => {
  const { changeHandle, forwardedHandle, handleHeld, make, age } = await setup();
  const owner = await make("owner@x.io", "firstname");
  const stranger = await make("stranger@x.io", "strangerdj");
  assert.equal(await changeHandle(owner, "secondname"), null);
  assert.equal(await forwardedHandle("firstname"), "secondname");

  await age("firstname", 13);
  assert.equal(await forwardedHandle("firstname"), "secondname", "still forwards on day 13");

  await age("firstname", 2);
  assert.equal(await forwardedHandle("firstname"), undefined, "stops forwarding after day 14");
  assert.equal(await handleHeld("firstname"), true, "still reserved on day 15");
  assert.match((await changeHandle(stranger, "firstname")) ?? "", /reserved/, "a stranger can't claim it on day 15");

  await age("firstname", 349);
  assert.equal(await handleHeld("firstname"), true, "still reserved on day 364");
  assert.match((await changeHandle(stranger, "firstname")) ?? "", /reserved/);
});

test("the owner can take the old name back while it's held, even after an email change", async () => {
  const { q, changeHandle, make, age } = await setup();
  const owner = await make("back@x.io", "backname");
  assert.equal(await changeHandle(owner, "awayname"), null);
  await age("backname", 100);
  await q.run("UPDATE users SET email = 'new-address@x.io' WHERE id = ?", owner);
  assert.equal(await changeHandle(owner, "backname"), null, "the hold follows the account, and the yearly limit doesn't block it");
  const row = await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", owner);
  assert.equal(row?.handle, "backname");
});

test("after the hold a stranger can claim the name and starts with nothing of the old owner's", async () => {
  const { q, changeHandle, make, age } = await setup();
  const owner = await make("old@x.io", "wantedname");
  const stranger = await make("new@x.io", "newcomer");
  await q.run("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Old callout', ?)", owner, Date.now());
  assert.equal(await changeHandle(owner, "movedname"), null);
  await age("wantedname", 366);
  assert.equal(await changeHandle(stranger, "wantedname"), null, "free once the hold ends");
  const count = async (id: number) => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM collections WHERE user_id = ?", id))!.n;
  assert.equal(await count(stranger), 0, "the new holder gets none of the old callouts");
  assert.equal(await count(owner), 1, "the old owner keeps them");
});

test("staff can give a held name to its rightful owner, even if the holder is suspended, and forwarding stops", async () => {
  const { q, changeHandle, forwardedHandle, handleHeld, make } = await setup();
  const impersonator = await make("fake@x.io", "artistx");
  const artist = await make("artist@x.io", "realartist");
  assert.equal(await changeHandle(impersonator, "fakez"), null);
  assert.equal(await forwardedHandle("artistx"), "fakez");
  assert.match((await changeHandle(artist, "artistx")) ?? "", /reserved/, "not without staff");
  await q.run("UPDATE users SET suspended_at = ? WHERE id = ?", Date.now(), impersonator);
  assert.equal(await changeHandle(artist, "artistx", { checks: false }), null, "staff assign it directly");
  assert.equal((await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", artist))?.handle, "artistx");
  assert.equal(await forwardedHandle("artistx"), undefined, "the impersonator's forward is gone");
  assert.equal(await q.get("SELECT 1 FROM handle_history WHERE old_handle = 'artistx'"), undefined);
  assert.equal(await handleHeld("artistx", 0, true), false);
});

test("staff still can't assign a deleted account's reserved name", async () => {
  const { q, changeHandle, make } = await setup();
  const someone = await make("someone@x.io", "someonedj");
  const t = Date.now();
  await q.run("INSERT INTO released_handles (handle, released_at, expires_at) VALUES ('deadname', ?, ?)", t, t + DAY);
  assert.match((await changeHandle(someone, "deadname", { checks: false })) ?? "", /reserved/);
});

test("a take-back ends every name the account held, so undo can't reach them", async () => {
  const { q, changeHandle, make } = await setup();
  const taken = await make("taken@x.io", "namea");
  await changeHandle(taken, "nameb", { checks: false });
  await changeHandle(taken, "namec", { checks: false });
  assert.equal((await q.all("SELECT 1 FROM handle_history WHERE user_id = ?", taken)).length, 2);
  assert.equal(await changeHandle(taken, "cleanname", { forward: false, checks: false }), null);
  assert.equal((await q.all("SELECT 1 FROM handle_history WHERE user_id = ?", taken)).length, 0);
  assert.match((await changeHandle(taken, "namea")) ?? "", /once a year/, "no free way back");
});

test("recovering a name is super-admin only, needs a reason and is logged", async () => {
  const actions = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const body = actions.slice(actions.indexOf("export async function adminChangeHandle(")).split("\nexport ")[0];
  assert.match(body, /^[^]*?\{\s*const a = await requireAdminAction\("super"\);/, "checks super before anything else");
  assert.match(body, /reason\.length < 5/);
  assert.match(body, /changeHandle\([^]*?checks: false/);
  assert.match(body, /await logAdmin\(a\.id, takeback \? "took back handle" : "changed handle"/);
  const { ACTION_NEEDS } = await import("../src/lib/ops-perms");
  assert.equal(ACTION_NEEDS.adminChangeHandle, "super");
  const { ROLE_PERMS } = await import("../src/lib/ops-perms");
  const { can } = await import("../src/lib/ops-access");
  for (const [role, perms] of Object.entries(ROLE_PERMS)) {
    if (role === "super") continue;
    assert.equal(can({ super: false, role, perms: new Set(perms) } as never, "super"), false, `${role} can't`);
  }
});

test("sign-up refuses a held name", async () => {
  const auth = fs.readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8");
  assert.match(auth, /await handleHeld\(a\.handle\)\)\) return \{ error: "That link is taken\." \}/);
  const { changeHandle, handleHeld, make } = await setup();
  const owner = await make("sign@x.io", "signupheld");
  await changeHandle(owner, "signupmoved");
  assert.equal(await handleHeld("signupheld"), true, "a signing-up visitor has no account id, so every hold applies");
});

test("going back keeps the original deadline and leaves the yearly limit alone", async () => {
  const { q, changeHandle, make, age } = await setup();
  const owner = await make("bounce@x.io", "bouncea");
  await changeHandle(owner, "bounceb");
  await age("bouncea", 100);
  const before = await q.get<{ expires_at: number }>("SELECT expires_at FROM handle_history WHERE old_handle = 'bouncea'");
  const changed = await q.get<{ handle_changed_at: number }>("SELECT handle_changed_at FROM users WHERE id = ?", owner);
  assert.equal(await changeHandle(owner, "bouncea"), null);
  const after = await q.get<{ expires_at: number; forward_until: number }>("SELECT expires_at, forward_until FROM handle_history WHERE old_handle = 'bounceb'");
  assert.equal(Number(after?.expires_at), Number(before?.expires_at), "the deadline carries over");
  assert.ok(Number(after?.forward_until) <= Number(after?.expires_at));
  const still = await q.get<{ handle_changed_at: number }>("SELECT handle_changed_at FROM users WHERE id = ?", owner);
  assert.equal(Number(still?.handle_changed_at), Number(changed?.handle_changed_at));
});

test("migration 0139 extends held names only", async () => {
  const { q, make, handleHeld } = await setup();
  const { MIGRATIONS: MIGRATIONS } = await import("../src/lib/db/migrations");
  const sql = MIGRATIONS.find((m) => m.id === "0139_handle_forward_until")!.sql;
  const owner = await make("mig@x.io", "migowner");
  const t = Date.now();
  await q.run("ALTER TABLE handle_history DROP COLUMN forward_until");
  const add = (name: string, created: number, expires: number) =>
    q.run("INSERT INTO handle_history (old_handle, user_id, forward, created_at, expires_at) VALUES (?,?,1,?,?)", name, owner, created, expires);
  await add("migactive", t - 5 * DAY, t + 9 * DAY);
  await add("migundo", t - DAY, t + 3 * DAY);
  await add("migexpired", t - 20 * DAY, t - 6 * DAY);
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) await q.run(statement);
  const row = (name: string) => q.get<{ expires_at: number; forward_until: number }>("SELECT expires_at, forward_until FROM handle_history WHERE old_handle = ?", name);
  const active = await row("migactive");
  assert.equal(Number(active?.forward_until), t + 9 * DAY, "forwarding keeps its old end");
  assert.equal(Number(active?.expires_at), t - 5 * DAY + 365 * DAY, "reservation counts from the rename");
  assert.equal(Number((await row("migundo"))?.expires_at), t - DAY + 365 * DAY);
  const expired = await row("migexpired");
  assert.equal(Number(expired?.expires_at), t - 6 * DAY, "an expired name isn't brought back");
  assert.equal(await handleHeld("migexpired"), false);
});
