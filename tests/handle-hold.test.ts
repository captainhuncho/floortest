import { test } from "node:test";
import assert from "node:assert/strict";
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
