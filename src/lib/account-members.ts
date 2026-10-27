import "server-only";
import crypto from "node:crypto";
import { now, q, type User } from "./db";
import { allow } from "./ratelimit";
import { switchOn } from "./switches";
import { env } from "./env";

/**
 * Account teams. A label, radio station or crew has one FloorTest account (its owner's) and invites the people who run
 * it. Each person keeps their own login and switches between desks; on a team desk they work on the account itself, so
 * they get everything the account's plan includes. Roles: the owner (everything), admins (everything but billing,
 * account security and deleting the account; they can override members' calls) and members (review, notes, replies).
 * Seats: the plan's seats (Free 1, Pro 2, Team 5) plus add-on seats set by FloorTest. Behind the "teams" switch.
 */

export type TeamRole = "owner" | "admin" | "member";
const RANK: Record<TeamRole, number> = { member: 1, admin: 2, owner: 3 };
export const atLeast = (role: TeamRole, min: TeamRole) => RANK[role] >= RANK[min];
export const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", admin: "A&R / Admin", member: "Member" };

const DAY = 86_400_000;
const INVITE_DAYS = 7;
const fingerprint = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class TeamError extends Error {}

/** Owners need two-step sign-in to manage their team (invite, roles, removal, reply approval), as A&R / Admins do for their powers (owner, 15 Oct 2026). */
export const TWO_STEP_TO_MANAGE = "Turn on two-step sign-in (Settings → Security) to manage your team.";
export const ownerNeedsTwoStep = (u: Pick<User, "role" | "totp_enabled_at">) => u.role === "owner" && !u.totp_enabled_at;
const needTwoStep = (desk: Pick<User, "role" | "totp_enabled_at">) => {
  if (ownerNeedsTwoStep(desk)) throw new TeamError(TWO_STEP_TO_MANAGE);
};

/**
 * Teams for everyone when the "teams" switch is on. While it's off (the beta, owner 15 Oct), teams still work on a desk
 * whose owner is an ops super admin (ADMIN_EMAILS), so the owner can test them with their own invitees. Pass the desk
 * (account) id wherever one is known; without it, only the switch counts.
 */
export async function teamsOn(deskId?: number | null) {
  if (await switchOn("teams", deskId ?? null)) return true;
  if (!deskId || !env.adminEmails.length) return false;
  const owner = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", deskId);
  return !!owner && env.adminEmails.includes(owner.email.toLowerCase());
}

/** Seats on an account: its plan's seats plus add-ons. The owner takes one. */
export async function seatsFor(accountId: number) {
  const r = await q.get<{ seats: number; extra: number }>(
    "SELECT COALESCE(p.seats, 1) AS seats, u.extra_seats AS extra FROM users u LEFT JOIN plans p ON p.id = u.plan WHERE u.id = ?",
    accountId,
  );
  return Number(r?.seats ?? 1) + Number(r?.extra ?? 0);
}

/** Seats in use: the owner, every member, and every invite still waiting. */
export async function seatsUsed(accountId: number) {
  const r = await q.get<{ m: number; i: number }>(
    `SELECT (SELECT COUNT(*)::int FROM account_members WHERE account_id = ?) AS m,
            (SELECT COUNT(*)::int FROM account_invites WHERE account_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?) AS i`,
    accountId, accountId, now(),
  );
  return 1 + Number(r?.m ?? 0) + Number(r?.i ?? 0);
}

/** The person's role on an account they're signed in to, or null if they have none. */
export async function roleOn(accountId: number, personId: number): Promise<TeamRole | null> {
  if (accountId === personId) return "owner";
  const r = await q.get<{ role: "admin" | "member"; twofa: number | null; ahead: number }>(
    `SELECT m.role, u.totp_enabled_at AS twofa,
       (SELECT COUNT(*)::int FROM account_members o WHERE o.account_id = m.account_id AND (o.created_at < m.created_at OR (o.created_at = m.created_at AND o.id < m.id))) AS ahead
     FROM account_members m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? AND m.user_id = ?`,
    accountId,
    personId,
  );
  if (!r) return null;
  // Over the seats (the plan was downgraded): the earliest joiners keep their seats, the rest are paused.
  if (Number(r.ahead) >= (await seatsFor(accountId)) - 1) return null;
  // Admin powers need two-step sign-in on the admin's own login; without it they work as a member.
  return r.role === "admin" && r.twofa ? "admin" : "member";
}

/** The teams this person can switch to (not their own account, and not ones where their seat is paused). */
export async function teamsFor(personId: number) {
  const rows = await q.all<{ id: number; name: string; handle: string; role: "admin" | "member" }>(
    `SELECT u.id, u.name, u.handle, m.role FROM account_members m JOIN users u ON u.id = m.account_id
     WHERE m.user_id = ? AND u.suspended_at IS NULL ORDER BY u.name`,
    personId,
  );
  const out = [];
  for (const r of rows) if ((await teamsOn(r.id)) && (await roleOn(r.id, personId))) out.push(r);
  return out;
}

/** Everyone on the account and the invites still waiting, for the Team page. */
export async function teamOf(accountId: number) {
  const owner = (await q.get<{ id: number; name: string; email: string }>("SELECT id, name, email FROM users WHERE id = ?", accountId))!;
  const members = await q.all<{ id: number; user_id: number; name: string; email: string; handle: string; role: "admin" | "member"; twofa: number | null; created_at: number }>(
    `SELECT m.id, m.user_id, u.name, u.email, u.handle, m.role, u.totp_enabled_at AS twofa, m.created_at FROM account_members m JOIN users u ON u.id = m.user_id
     WHERE m.account_id = ? ORDER BY m.created_at, m.id`,
    accountId,
  );
  const seats = await seatsFor(accountId);
  const invites = await q.all<{ id: number; email: string; role: "admin" | "member"; created_at: number; expires_at: number }>(
    "SELECT id, email, role, created_at, expires_at FROM account_invites WHERE account_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at",
    accountId,
    now(),
  );
  // Members past the seats (after a downgrade) are paused: they keep their place but can't open the desk.
  return { owner, members: members.map((m, i) => ({ ...m, paused: i >= seats - 1 })), invites, seats, used: await seatsUsed(accountId) };
}

/** Owners invite admins or members; admins invite members. Returns the invite secret (emailed, never stored). */
export async function inviteToTeam(desk: Pick<User, "id" | "role" | "actor_id" | "email" | "totp_enabled_at">, rawEmail: string, role: "admin" | "member") {
  if (!(await teamsOn(desk.id))) throw new TeamError("Teams aren't available yet.");
  if (!atLeast(desk.role, "admin")) throw new TeamError("Only the owner or an A&R / Admin can invite people.");
  needTwoStep(desk);
  if (role === "admin" && desk.role !== "owner") throw new TeamError("Only the owner can invite A&R / Admins.");
  const email = rawEmail.trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) throw new TeamError("Enter a valid email.");
  if (email === desk.email.toLowerCase()) throw new TeamError("That's the account's own email.");
  if (await q.get("SELECT 1 FROM account_members m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? AND lower(u.email) = ?", desk.id, email))
    throw new TeamError("They're already on the team.");
  if (await seatsUsed(desk.id) >= (await seatsFor(desk.id))) throw new TeamError("All your seats are in use. Remove someone, or ask us for extra seats.");
  if (!(await allow("team_invite", String(desk.id), 20, DAY))) throw new TeamError("Too many invites today. Try again tomorrow.");
  const secret = crypto.randomBytes(24).toString("base64url");
  // A new invite replaces any live one for this email, in one step: the database allows one live invite per email.
  await q.tx(async (db) => {
    await db.run("UPDATE account_invites SET revoked_at = ? WHERE account_id = ? AND lower(email) = ? AND accepted_at IS NULL AND revoked_at IS NULL", now(), desk.id, email);
    await db.run(
      "INSERT INTO account_invites (account_id, email, role, token_hash, invited_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?)",
      desk.id, email, role, fingerprint(secret), desk.actor_id, now(), now() + INVITE_DAYS * DAY,
    );
  });
  return { secret, email };
}

/** A waiting invite by its secret, with the account's name. */
export async function inviteBySecret(secret: string) {
  if (!secret || secret.length > 100) return undefined;
  const invite = await q.get<{ id: number; account_id: number; email: string; role: "admin" | "member"; account_name: string; account_handle: string }>(
    `SELECT i.id, i.account_id, i.email, i.role, u.name AS account_name, u.handle AS account_handle FROM account_invites i JOIN users u ON u.id = i.account_id
     WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? AND u.suspended_at IS NULL`,
    fingerprint(secret),
    now(),
  );
  return invite && (await teamsOn(invite.account_id)) ? invite : undefined;
}

/**
 * The newest live invite sent to this exact email. Used only where the email is already proven (Google sign-up: Google
 * confirmed it), so the person doesn't need the invite link in this browser.
 */
export async function inviteForEmail(email: string) {
  const invite = await q.get<{ id: number; account_id: number; email: string; role: "admin" | "member"; account_name: string; account_handle: string }>(
    `SELECT i.id, i.account_id, i.email, i.role, u.name AS account_name, u.handle AS account_handle FROM account_invites i JOIN users u ON u.id = i.account_id
     WHERE i.email = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? AND u.suspended_at IS NULL ORDER BY i.created_at DESC LIMIT 1`,
    email.trim().toLowerCase(),
    now(),
  );
  return invite && (await teamsOn(invite.account_id)) ? invite : undefined;
}

/** Accepts the live invite sent to this person's (proven) email, if there is one. */
export async function acceptInviteForEmail(person: Pick<User, "id" | "email" | "email_verified_at">) {
  const inv = await inviteForEmail(person.email);
  return inv ? join(inv, person) : undefined;
}

/** Accepts an invite as this signed-in person. Their confirmed email must be the one invited. */
export async function acceptInvite(secret: string, person: Pick<User, "id" | "email" | "email_verified_at">) {
  const inv = await inviteBySecret(secret);
  if (!inv) throw new TeamError("This invite isn't valid any more. Ask for a new one.");
  return join(inv, person);
}

async function join<I extends { id: number; account_id: number; email: string; role: "admin" | "member" }>(inv: I, person: Pick<User, "id" | "email" | "email_verified_at">) {
  if (person.email.toLowerCase() !== inv.email) throw new TeamError(`This invite was sent to ${inv.email}. Log in with that email to accept it.`);
  if (!person.email_verified_at) throw new TeamError("Confirm your email first (check your inbox), then open the invite again.");
  if (person.id === inv.account_id) throw new TeamError("That's your own account.");
  await q.tx(async (db) => {
    await db.run("UPDATE account_invites SET accepted_at = ? WHERE id = ?", now(), inv.id);
    await db.run(
      "INSERT INTO account_members (account_id, user_id, role, invited_by, created_at) VALUES (?,?,?,(SELECT invited_by FROM account_invites WHERE id = ?),?) ON CONFLICT (account_id, user_id) DO NOTHING",
      inv.account_id, person.id, inv.role, inv.id, now(),
    );
  });
  return inv;
}

export async function revokeInvite(desk: Pick<User, "id" | "role" | "totp_enabled_at">, inviteId: number) {
  if (!atLeast(desk.role, "admin")) throw new TeamError("Only the owner or an A&R / Admin can do that.");
  needTwoStep(desk);
  await q.run("UPDATE account_invites SET revoked_at = ? WHERE id = ? AND account_id = ? AND accepted_at IS NULL", now(), inviteId, desk.id);
}

/** Owners remove anyone; admins remove members. Their access to this desk ends on their next click. */
export async function removeFromTeam(desk: Pick<User, "id" | "role" | "actor_id" | "totp_enabled_at">, memberId: number) {
  const m = await q.get<{ user_id: number; role: "admin" | "member" }>("SELECT user_id, role FROM account_members WHERE id = ? AND account_id = ?", memberId, desk.id);
  if (!m) throw new TeamError("Not found");
  const self = m.user_id === desk.actor_id;
  if (!self) needTwoStep(desk); // leaving is always allowed; removing others is management
  if (!self && !atLeast(desk.role, "admin")) throw new TeamError("Only the owner or an A&R / Admin can remove people.");
  if (!self && m.role === "admin" && desk.role !== "owner") throw new TeamError("Only the owner can remove an A&R / Admin.");
  await q.run("DELETE FROM account_members WHERE id = ?", memberId);
  return m;
}

export async function setTeamRole(desk: Pick<User, "id" | "role" | "totp_enabled_at">, memberId: number, role: "admin" | "member") {
  if (desk.role !== "owner") throw new TeamError("Only the owner can change roles.");
  needTwoStep(desk);
  await q.run("UPDATE account_members SET role = ? WHERE id = ? AND account_id = ?", role, memberId, desk.id);
}

/** Ops: add-on seats for an account (bought separately while card payments aren't live). */
export async function setExtraSeats(accountId: number, n: number) {
  await q.run("UPDATE users SET extra_seats = ? WHERE id = ?", Math.max(0, Math.min(500, Math.floor(n))), accountId);
}

/* ── Replies that need approval ── */

/** The account's reply-approval setting: off, or on with one approver (the owner or a teammate). */
export async function replyApproval(accountId: number) {
  const r = await q.get<{ on: number; approver: number | null }>("SELECT reply_approval AS on, reply_approver_id AS approver FROM users WHERE id = ?", accountId);
  return { on: !!Number(r?.on), approver: r?.approver ?? accountId };
}

/** Owners and admins switch approval on (choosing the approver, who must be on the team) or off. */
export async function setReplyApproval(desk: Pick<User, "id" | "role" | "totp_enabled_at">, on: boolean, approverId: number) {
  if (!atLeast(desk.role, "admin")) throw new TeamError("Only the owner or an A&R / Admin can change this.");
  needTwoStep(desk);
  const onTeam = approverId === desk.id || !!(await q.get("SELECT 1 FROM account_members WHERE account_id = ? AND user_id = ?", desk.id, approverId));
  if (!onTeam) throw new TeamError("Choose someone on the team.");
  await q.run("UPDATE users SET reply_approval = ?, reply_approver_id = ? WHERE id = ?", on ? 1 : 0, approverId, desk.id);
}

/** A member's reply needs approval when it's switched on and they aren't the approver themselves. */
export async function replyNeedsApproval(desk: Pick<User, "id" | "role" | "actor_id">) {
  if (desk.role !== "member" || desk.actor_id === desk.id || !(await teamsOn(desk.id))) return false;
  const a = await replyApproval(desk.id);
  return a.on && a.approver !== desk.actor_id;
}

export async function holdReply(desk: Pick<User, "id" | "actor_id">, senderId: number, trackId: number | null, body: string) {
  await q.run(
    "INSERT INTO held_replies (account_id, author_id, sender_id, track_id, body, created_at) VALUES (?,?,?,?,?,?)",
    desk.id, desk.actor_id, senderId, trackId, body.slice(0, 4000), now(),
  );
}

/** Can this person approve held replies here? The chosen approver, and always the owner and admins (override). */
export async function canApprove(desk: Pick<User, "id" | "role" | "actor_id">) {
  if (atLeast(desk.role, "admin")) return true;
  return (await replyApproval(desk.id)).approver === desk.actor_id;
}

/** Replies waiting on this desk (for approvers), or the person's own waiting replies (for everyone else). */
export async function heldReplies(desk: Pick<User, "id" | "role" | "actor_id">) {
  const all = await canApprove(desk);
  return q.all<{ id: number; author: string | null; sender_id: number; sender: string; track_id: number | null; title: string | null; body: string; created_at: number }>(
    `SELECT h.id, a.name AS author, h.sender_id, s.name AS sender, h.track_id, t.title, h.body, h.created_at FROM held_replies h
     JOIN senders s ON s.id = h.sender_id LEFT JOIN users a ON a.id = h.author_id LEFT JOIN tracks t ON t.id = h.track_id
     WHERE h.account_id = ? AND h.status = 'waiting' ${all ? "" : "AND h.author_id = ?"} ORDER BY h.created_at`,
    ...(all ? [desk.id] : [desk.id, desk.actor_id]),
  );
}

/** Takes one waiting reply for a decision (approve or turn down); only once. */
export async function decideHeld(desk: Pick<User, "id" | "role" | "actor_id">, heldId: number, status: "sent" | "rejected") {
  if (!(await canApprove(desk))) throw new TeamError("Only the approver, the owner or an A&R / Admin can do that.");
  return q.get<{ id: number; sender_id: number; track_id: number | null; body: string; author_id: number | null }>(
    "UPDATE held_replies SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND account_id = ? AND status = 'waiting' RETURNING id, sender_id, track_id, body, author_id",
    status, desk.actor_id, now(), heldId, desk.id,
  );
}
