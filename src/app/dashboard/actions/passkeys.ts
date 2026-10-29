"use server";

/** Passkeys on Settings → Security: add one or remove one, each after the password check. Desk owners only. */
import { requireRole } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { stepUp } from "@/lib/step-up";
import { addOptions, addPasskey, removePasskey } from "@/lib/passkeys";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { done } from "./common";

/**
 * Step 1 of adding a passkey: the same check as other sensitive changes (password, plus the two-step code when it's
 * on), so a borrowed or stolen session can't quietly add a way back in. Then the browser makes the passkey.
 */
export async function startAddPasskey(password: string, code: string) {
  const u = await requireRole("owner");
  if (!u.email_verified_at) return { error: "Confirm your email first. Check your inbox for the confirmation link." };
  if (!(await allow("passkey_add", String(u.id), 20, 3_600_000))) return { error: "Too many tries. Wait an hour and try again." };
  const denied = await stepUp(u.id, String(password).slice(0, 200), String(code).slice(0, 40));
  if (denied) return { error: denied };
  const options = await addOptions(u);
  if (!options) return { error: "Passkeys can't be added at this address. Open FloorTest at its usual address and try again." };
  return { options };
}

/** Step 2: the browser's answer. Saved only if it checks out against the step 1 challenge. */
export async function finishAddPasskey(answer: unknown): Promise<{ ok: true } | { error: string }> {
  const u = await requireRole("owner");
  const r = await addPasskey(u.id, answer);
  if ("error" in r) return r;
  await audit(u.id, "passkey_added", r.name);
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "A passkey was added to your FloorTest account",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nA passkey (${r.name}) was just added to your FloorTest account. It can sign you in without a password.\n\nIf this wasn't you, remove it in Settings → Security, change your password and contact us.\n\n— FloorTest`,
  });
  done();
  return { ok: true };
}

/** Removing one needs the same check as adding one, so a borrowed session can't quietly take away the owner's way in. */
export async function deletePasskey(id: number, password: string, code: string): Promise<{ ok: true } | { error: string }> {
  const u = await requireRole("owner");
  const denied = await stepUp(u.id, String(password || "").slice(0, 200), String(code || "").slice(0, 40));
  if (denied) return { error: denied };
  const name = Number.isSafeInteger(id) ? await removePasskey(u.id, id) : null;
  if (!name) return { error: "That passkey was already removed." };
  await audit(u.id, "passkey_removed", name);
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "A passkey was removed from your FloorTest account",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nThe passkey ${name} was just removed from your FloorTest account. It can no longer sign you in.\n\nIf this wasn't you, change your password now and contact us.\n\n— FloorTest`,
  });
  done();
  return { ok: true };
}
