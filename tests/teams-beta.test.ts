import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. The owner's email is the super admin.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-teams-beta-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "boss@x.io";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("with the teams switch off, teams work only on a desk the super admin owns", async () => {
  const { q } = await import("../src/lib/db");
  const { teamsOn, inviteToTeam, inviteBySecret, teamsFor } = await import("../src/lib/account-members");
  const t = Date.now();
  const user = async (handle: string, email: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id", email, handle, handle, t, t))!.id;
  const boss = await user("boss", "boss@x.io");
  const other = await user("other", "other@x.io");
  const helper = await user("helper", "helper@x.io");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 0, ?) ON CONFLICT (key) DO UPDATE SET on_ = 0", t);

  assert.equal(await teamsOn(), false, "no desk: only the switch counts");
  assert.equal(await teamsOn(boss), true, "the super admin's desk keeps teams");
  assert.equal(await teamsOn(other), false, "anyone else's desk doesn't");

  // The owner can invite, and the invite opens; another receiver can't invite at all.
  const { secret } = await inviteToTeam({ id: boss, role: "owner", actor_id: boss, email: "boss@x.io" }, "helper@x.io", "member");
  assert.equal((await inviteBySecret(secret))?.account_id, boss);
  await assert.rejects(inviteToTeam({ id: other, role: "owner", actor_id: other, email: "other@x.io" }, "helper@x.io", "member"), /aren't available/);

  // A teammate sees the super admin's desk to switch to, but not a desk on someone else's account.
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?,?,'member',?), (?,?,'member',?)", boss, helper, t, other, helper, t);
  assert.deepEqual((await teamsFor(helper)).map((d) => d.id), [boss]);

  // Switched on, teams are for everyone again.
  await q.run("UPDATE switches SET on_ = 1 WHERE key = 'teams'");
  assert.equal(await teamsOn(other), true);
});
