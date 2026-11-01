import "server-only";
import crypto from "node:crypto";
import { now, q, type Queryable } from "@/lib/db";
import { env } from "@/lib/env";
import { cancelHeldMail, SEND_HOLD_MS } from "@/lib/mail";

/**
 * Undo for ops actions that hold an email (ops server design §2, owner 1 Nov). The action answers with a token signed
 * with the app secret, naming what to put back, the held emails, the admin who did it and when it stops working (the
 * hold). undoSend checks the signature, that the caller is that admin and that it hasn't expired, so Undo is exactly as
 * allowed as the action was, with no second permission list.
 *
 * Kinds and their items: plan_approve { ref: request, user, prev: old plan }; plan_decline { ref: request };
 * waitlist_invite { ref: waitlist entry, code: the new invite }; invite_resend { code: the code sent, prev: the old code
 * it replaced, if any }; email_resend (nothing to put back, only the email to stop).
 */
export type UndoKind = "plan_approve" | "plan_decline" | "waitlist_invite" | "invite_resend" | "email_resend";
export type UndoItem = { ref?: number; user?: number; prev?: string; code?: string };
export type Undo = { kind: UndoKind; items: UndoItem[]; mail: number[]; admin: number; exp: number };

const sig = (body: string) => crypto.createHmac("sha256", `ops-undo:${env.secret}`).update(body).digest("base64url");

export function signUndo(u: Omit<Undo, "exp">, at = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...u, exp: at + SEND_HOLD_MS })).toString("base64url");
  return `${body}.${sig(body)}`;
}

/** The undo this token stands for, or null: forged, another admin's, or past the hold. */
export function readUndo(token: string, adminId: number, at = Date.now()): Undo | null {
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sig(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const u = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Undo;
    return u.admin === adminId && at <= u.exp && Array.isArray(u.items) && Array.isArray(u.mail) ? u : null;
  } catch {
    return null;
  }
}

/** Puts back what a held action changed for one item whose email was stopped. */
export async function revertItem(db: Queryable, u: Undo, item: UndoItem) {
  const reopen = "UPDATE plan_requests SET status = 'pending', granted_plan = NULL, decided_by = NULL, decided_at = NULL, decision_note = '' WHERE id = ? AND status = ?";
  if (u.kind === "plan_approve") {
    const back = await db.run(reopen, item.ref, "approved");
    if (back.changes) await db.run("UPDATE users SET plan = ? WHERE id = ?", item.prev, item.user);
  } else if (u.kind === "plan_decline") await db.run(reopen, item.ref, "declined");
  else if (u.kind === "waitlist_invite") {
    // The unsent code stops working (kept, revoked, like any revoked invite); the person is waiting again.
    await db.run("UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL", now(), item.code);
    await db.run("UPDATE waitlist SET invited_at = NULL WHERE id = ?", item.ref);
  } else if (u.kind === "invite_resend" && item.prev) {
    // The resend swapped an old short code for a new one: the old one comes back, the unsent new one is revoked.
    await db.run("UPDATE invites SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL", now(), item.code);
    await db.run("UPDATE invites SET revoked_at = NULL WHERE code = ?", item.prev);
  }
}

/**
 * Stops the emails not yet tried and puts back what changed for those, in one transaction: if putting back fails, the
 * emails aren't stopped either, so nobody is left with the change and no email (or the reverse). Each item has one
 * email, in the same order (email_resend has no items). Returns how many emails it stopped.
 */
export async function takeBack(u: Undo, revert: typeof revertItem = revertItem): Promise<number> {
  return q.tx(async (db) => {
    let stopped = 0;
    for (const [i, id] of u.mail.entries()) {
      if (!(await cancelHeldMail([id], db))) continue;
      stopped++;
      if (u.items[i]) await revert(db, u, u.items[i]);
    }
    return stopped;
  });
}
