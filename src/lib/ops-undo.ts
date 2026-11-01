import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { SEND_HOLD_MS } from "@/lib/mail";

/**
 * Undo for ops actions that hold an email (ops server design §2, owner 1 Nov). The action answers with a token signed
 * with the app secret, naming what to put back, the held emails, the admin who did it and when it stops working (the
 * hold). undoSend checks the signature, that the caller is that admin and that it hasn't expired, so Undo is exactly as
 * allowed as the action was, with no second permission list.
 */
export type UndoKind = "plan_approve" | "plan_decline";
export type Undo = { kind: UndoKind; ref: number; user: number; prev: string; mail: number[]; admin: number; exp: number };

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
    return u.admin === adminId && at <= u.exp ? u : null;
  } catch {
    return null;
  }
}
