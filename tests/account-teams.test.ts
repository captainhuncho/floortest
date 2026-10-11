import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-teams-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("account teams: seats by plan, invites, roles, removal, reply approval and the override lock", async () => {
  const { q } = await import("../src/lib/db");
  const T = await import("../src/lib/account-members");
  const { decisionLocked } = await import("../src/lib/review");
  const now = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
  const user = async (handle: string, plan = "free", twofa = false) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, totp_enabled_at, created_at) VALUES (?, 'h', ?, ?, ?, 'UTC', ?, ?, ?) RETURNING id",
      `${handle}@team.io`, handle, handle, plan, now, twofa ? now : null, now,
    ))!.id;
  const label = await user("label", "pro");
  const ama = await user("ama", "free", true);
  const kofi = await user("kofi");
  const desk = (role: "owner" | "admin" | "member", actor = label) => ({ id: label, role, actor_id: actor, email: "label@team.io" });
  const person = async (id: number) => (await q.get<{ id: number; email: string; email_verified_at: number | null }>("SELECT id, email, email_verified_at FROM users WHERE id = ?", id))!;

  // Seats come from the plan: Free 1, Pro 2, Team 5, plus add-ons.
  assert.equal(await T.seatsFor(label), 2);
  await assert.rejects(T.inviteToTeam(desk("member"), "x@team.io", "member"), /owner or an admin/);
  const a = await T.inviteToTeam(desk("owner"), "ama@team.io", "admin");
  await assert.rejects(T.inviteToTeam(desk("owner"), "kofi@team.io", "member"), /All your seats/, "Pro: you + 1");
  await T.setExtraSeats(label, 1);
  assert.equal(await T.seatsFor(label), 3);
  const k = await T.inviteToTeam(desk("owner"), "kofi@team.io", "member");

  // Accepting: only with the invited email, and only once.
  await assert.rejects(T.acceptInvite(a.secret, await person(kofi)), /sent to ama@team.io/);
  await T.acceptInvite(a.secret, await person(ama));
  await assert.rejects(T.acceptInvite(a.secret, await person(ama)), /isn't valid/);
  await T.acceptInvite(k.secret, await person(kofi));
  assert.equal(await T.roleOn(label, ama), "admin");
  assert.equal(await T.roleOn(label, kofi), "member");
  assert.equal(await T.roleOn(label, label), "owner");
  assert.equal(await T.roleOn(kofi, ama), null, "a seat works only on the desk it came from");
  assert.deepEqual((await T.teamsFor(kofi)).map((t) => t.id), [label]);

  // Admin powers need two-step sign-in on the admin's own login.
  await q.run("UPDATE users SET totp_enabled_at = NULL WHERE id = ?", ama);
  assert.equal(await T.roleOn(label, ama), "member");
  await q.run("UPDATE users SET totp_enabled_at = ? WHERE id = ?", now, ama);

  // Removal: members can't remove others; only the owner can remove an admin (checked with the admin's own row).
  const team = await T.teamOf(label);
  const amaRow = team.members.find((m) => m.user_id === ama)!;
  const kofiRow = team.members.find((m) => m.user_id === kofi)!;
  await assert.rejects(T.removeFromTeam(desk("member", kofi), amaRow.id), /owner or an admin/);
  await assert.rejects(T.removeFromTeam({ id: label, role: "admin", actor_id: 999 }, amaRow.id), /Only the owner can remove an admin/);

  // Reply approval: off by default; on with an approver, members' replies wait; the approver, owner and admins approve.
  assert.equal(await T.replyNeedsApproval(desk("member", kofi)), false);
  await assert.rejects(T.setReplyApproval(desk("member", kofi), true, label), /owner or an admin/);
  await assert.rejects(T.setReplyApproval(desk("owner"), true, 999999), /someone on the team/);
  await T.setReplyApproval(desk("owner"), true, ama);
  assert.equal(await T.replyNeedsApproval(desk("member", kofi)), true);
  assert.equal(await T.replyNeedsApproval(desk("admin", ama)), false, "admins reply directly");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", label, now))!.id;
  await T.holdReply(desk("member", kofi), sender, null, "Love this, send the extended mix?");
  assert.equal((await T.heldReplies(desk("member", kofi))).length, 1, "the author sees their own waiting reply");
  assert.equal(await T.canApprove(desk("member", kofi)), false);
  const [held] = await T.heldReplies(desk("admin", ama));
  await assert.rejects(T.decideHeld(desk("member", kofi), held.id, "sent"), /approver/);
  assert.ok(await T.decideHeld(desk("admin", ama), held.id, "sent"));
  assert.equal(await T.decideHeld(desk("owner"), held.id, "rejected"), undefined, "answered once");

  // Override: a member can't change an owner's or admin's call; owners and admins can change anyone's.
  assert.equal(decisionLocked({ role: "member" }, { decision: "kept", decided_role: "admin" }), true);
  assert.equal(decisionLocked({ role: "member" }, { decision: "kept", decided_role: "member" }), false);
  assert.equal(decisionLocked({ role: "admin" }, { decision: "kept", decided_role: "owner" }), false);

  // Google sign-up: an invite found by its (Google-proven) email, accepted once.
  const neo = await user("neo");
  await T.inviteToTeam(desk("owner"), "neo@team.io", "member").catch(async () => {
    await T.setExtraSeats(label, 5);
    return T.inviteToTeam(desk("owner"), "neo@team.io", "member");
  });
  assert.equal((await T.inviteForEmail("NEO@team.io"))?.account_id, label);
  assert.equal((await T.acceptInviteForEmail(await person(neo)))?.account_id, label);
  assert.equal(await T.inviteForEmail("neo@team.io"), undefined, "used up");
  assert.equal(await T.roleOn(label, neo), "member");

  // Leaving ends access at once.
  await T.removeFromTeam(desk("member", kofi), kofiRow.id);
  assert.equal(await T.roleOn(label, kofi), null);
});
