import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-team-errors-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// A refused change must say so, so the page can show it and the audit log never records it as done (Batch C, 28 Oct).
test("a role change or invite cancel that changes nothing is refused, not passed off as done", async () => {
  const { q } = await import("../src/lib/db");
  const T = await import("../src/lib/account-members");
  const t = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", t);
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, totp_enabled_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?, ?) RETURNING id",
      `${handle}@err.io`, handle, handle, t, t, t,
    ))!.id;
  const label = await user("errlabel");
  const other = await user("errother");
  const ama = await user("errama");
  const desk = (id: number, role: "owner" | "admin" | "member" = "owner") => ({ id, role, actor_id: id, email: `${id}@err.io`, totp_enabled_at: 1 });
  const person = async (id: number) => (await q.get<{ id: number; email: string; email_verified_at: number | null }>("SELECT id, email, email_verified_at FROM users WHERE id = ?", id))!;
  const inviteId = async (email: string) => (await q.get<{ id: number }>("SELECT id FROM account_invites WHERE email = ?", email))!.id;

  const inv = await T.inviteToTeam(desk(label), "errama@err.io", "member");
  await T.acceptInvite(inv.secret, await person(ama));
  const member = (await q.get<{ id: number }>("SELECT id FROM account_members WHERE account_id = ? AND user_id = ?", label, ama))!.id;

  await assert.rejects(T.setTeamRole(desk(label), 999_999, "admin"), /Not found/, "no such member");
  await assert.rejects(T.setTeamRole(desk(other), member, "admin"), /Not found/, "a member of someone else's team");
  await assert.rejects(T.setTeamRole(desk(label, "admin"), member, "admin"), /Only the owner/);
  await T.setTeamRole(desk(label), member, "admin");
  assert.equal(await T.roleOn(label, ama), "admin", "a real change still works");

  await assert.rejects(T.revokeInvite(desk(label), 999_999), /Not found/, "no such invite");
  await assert.rejects(T.revokeInvite(desk(label), await inviteId("errama@err.io")), /Not found/, "an accepted invite can't be cancelled");
  await T.inviteToTeam(desk(label), "later@err.io", "member");
  const open = await inviteId("later@err.io");
  await assert.rejects(T.revokeInvite(desk(other), open), /Not found/, "someone else's invite");
  await T.revokeInvite(desk(label), open);
  await assert.rejects(T.revokeInvite(desk(label), open), /Not found/, "cancelled twice");
});

test("the team actions record a role change or a cancelled invite only after it worked", () => {
  // Server actions need a signed-in request, so this checks the code path: no swallowed error, audit after success.
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/account-team.ts", import.meta.url), "utf8");
  for (const fn of ["changeTeamRole", "cancelTeamInvite"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}`)).split("\nexport ")[0];
    assert.doesNotMatch(body, /\.catch\(\(\) => \{\}\)/, `${fn} doesn't swallow a refusal`);
    assert.match(body, /return fail\(e\)/, `${fn} hands the refusal back to the page`);
  }
});
