"use server";

/** Account teams: invite, remove, roles, reply approval, switching desks, and accepting an invite. */
import { redirect } from "next/navigation";
import { requirePerson, requireUser, setDesk } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  acceptInvite,
  decideHeld,
  inviteToTeam,
  removeFromTeam,
  revokeInvite,
  roleOn,
  setReplyApproval,
  setTeamRole,
  TeamError,
} from "@/lib/account-members";
import { q } from "@/lib/db";
import { ownedSender, ownedTrack } from "@/lib/desk";
import { APP_URL, sendMail } from "@/lib/mail";
import { reply } from "@/lib/review";
import { done } from "./common";

export type TeamState = { ok?: string; error?: string } | null;
const fail = (e: unknown): TeamState => ({ error: e instanceof TeamError ? e.message : "Couldn't save that. Nothing changed. Try again." });

export async function inviteTeammate(_prev: TeamState, form: FormData): Promise<TeamState> {
  const u = await requireUser();
  try {
    const role = form.get("role") === "admin" ? "admin" : "member";
    const { secret, email } = await inviteToTeam(u, String(form.get("email") || ""), role);
    await sendMail({
      userId: u.id,
      audience: "receiver",
      to: email,
      secrets: [secret],
      subject: u.actor_id === u.id ? `${u.name} invited you to their team on FloorTest` : `${u.actor_name} invited you to ${u.name}'s team on FloorTest`,
      body: `Hi,\n\n${u.actor_id === u.id ? u.name : `${u.actor_name} (${u.name})`} invited you to join their team on FloorTest as ${role === "admin" ? "an A&R / Admin" : "a member"}, to review and reply to the music sent to ${APP_URL.replace(/^https?:\/\//, "")}/${u.handle}.\n\nThere's no code to type: open this link to accept (it works for 7 days):\n${APP_URL}/join/${secret}\n\nYou'll use your own FloorTest login with this email address (${email}). No account yet? Create one from that link, with a password or with Google.\n\n— FloorTest`,
    });
    await audit(u.id, "team_invited", `${email} (${role})`);
    done();
    return { ok: `Invite sent to ${email}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelTeamInvite(inviteId: number) {
  const u = await requireUser();
  await revokeInvite(u, inviteId).catch(() => {});
  await audit(u.id, "team_invite_revoked", `invite ${inviteId}`);
  done();
}

/** Owners remove anyone, admins remove members, anyone can remove themselves (leave). */
export async function removeTeammate(memberId: number) {
  const u = await requireUser();
  const m = await removeFromTeam(u, memberId).catch(() => null);
  if (!m) return;
  const who = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", m.user_id);
  if (m.user_id === u.actor_id) {
    await audit(u.id, "team_left", who?.email ?? "");
    await setDesk(null);
    redirect("/dashboard/floor");
  }
  await audit(u.id, "team_removed", who?.email ?? "");
  done();
}

export async function changeTeamRole(memberId: number, role: "admin" | "member") {
  const u = await requireUser();
  await setTeamRole(u, memberId, role === "admin" ? "admin" : "member").catch(() => {});
  await audit(u.id, "team_role", `member ${memberId} → ${role}`);
  done();
}

export async function saveReplyApproval(_prev: TeamState, form: FormData): Promise<TeamState> {
  const u = await requireUser();
  try {
    const on = form.get("approval") === "on";
    await setReplyApproval(u, on, Number(form.get("approver")) || u.id);
    await audit(u.id, "reply_approval_set", on ? "on" : "off");
    done();
    return { ok: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

/** The approver (or the owner or an A&R / Admin) sends a held reply, edited if they like, or turns it down. */
export async function answerHeldReply(heldId: number, send: boolean, form: FormData) {
  const u = await requireUser();
  const h = await decideHeld(u, heldId, send ? "sent" : "rejected").catch(() => undefined);
  if (!h) return done();
  const s = await ownedSender(u, h.sender_id);
  if (send && s) {
    const t = h.track_id ? await ownedTrack(u, h.track_id) : undefined;
    const body = String(form.get("body") || "").trim().slice(0, 4000) || h.body;
    await reply(u, s, t, body);
  }
  await audit(u.id, send ? "reply_approved" : "reply_rejected", s?.name ?? "", h.track_id);
  done();
}

/** Switch to your own desk (null) or a team desk you're on. */
export async function switchDesk(accountId: number | null) {
  const me = await requirePerson();
  if (accountId && accountId !== me.id && !(await roleOn(accountId, me.id))) return;
  await setDesk(accountId && accountId !== me.id ? accountId : null);
  redirect("/dashboard/floor");
}

/** Accept an invite as the signed-in person, then open the team's desk. */
export async function joinTeam(secret: string): Promise<TeamState> {
  const me = await requirePerson();
  try {
    const inv = await acceptInvite(secret, me);
    await audit(inv.account_id, "team_joined", me.email);
    await setDesk(inv.account_id);
  } catch (e) {
    return fail(e);
  }
  redirect("/dashboard/floor");
}
