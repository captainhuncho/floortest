import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-reply-approver-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// A paused seat (over the plan's seats) can't open the desk, so it can't be the one member replies wait for.
test("reply approval refuses an approver whose seat is paused", async () => {
  const { q } = await import("../src/lib/db");
  const T = await import("../src/lib/account-members");
  const t = Date.now();
  const user = async (handle: string, plan = "free") =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, totp_enabled_at, created_at) VALUES (?, 'h', ?, ?, ?, 'UTC', ?, ?, ?) RETURNING id",
      `${handle}@seat.io`, handle, handle, plan, t, t, t,
    ))!.id;
  const label = await user("seatlabel", "pro");
  const first = await user("seatfirst");
  const second = await user("seatsecond");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?), (?, ?, 'member', ?)", label, first, t, label, second, t + 1);
  const owner = { id: label, role: "owner" as const, totp_enabled_at: t };

  // Pro is you + 1: the earlier joiner keeps the seat, the later one is paused.
  assert.equal(await T.roleOn(label, first), "member");
  assert.equal(await T.roleOn(label, second), null);
  await assert.rejects(T.setReplyApproval(owner, true, second), /Choose someone on the team/);
  assert.equal((await T.replyApproval(label)).on, false, "nothing saved");
  await T.setReplyApproval(owner, true, first);
  assert.equal((await T.replyApproval(label)).approver, first);
  await T.setReplyApproval(owner, true, label);
  assert.equal((await T.replyApproval(label)).approver, label, "the owner can always approve");
});
