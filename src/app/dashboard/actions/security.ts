"use server";

/** Security: password, other devices, two-factor and sign-in alerts. */
import { passwordStrength } from "@/lib/password-strength";
import { currentSessionHash, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { hashRecovery, newRecoveryCodes, newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "@/lib/totp";
import { now, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { done } from "./common";
import { type SettingsState } from "./settings";

/** Changes the password after checking the current one, and signs out every other device. */
export async function changePassword(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const current = String(form.get("current") || "");
  const next = String(form.get("password") || "");
  const row = await q.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id);
  if (!row || !verifyPassword(current, row.password_hash)) return { error: "Your current password isn't right." };
  if (next === current) return { error: "Pick a password you haven't used here." };
  const strength = passwordStrength(next, [u.name, u.email, u.handle]);
  if (!strength.ok) return { error: strength.tip ?? "Choose a stronger password." };
  if (String(form.get("confirm") || "") !== next) return { error: "The two new passwords don't match." };
  const keep = await currentSessionHash();
  await q.run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), u.id);
  await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", u.id, keep ?? "");
  await audit(u.id, "password_changed");
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "Your FloorTest password was changed",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nYour FloorTest password was just changed and every other device was signed out.\n\nIf this wasn't you, reset your password now from the log-in page and contact us.\n\n— FloorTest`,
  });
  return { ok: true };
}

/** Ends every session except this one: lost phone, shared laptop. */
export async function signOutOtherDevices(): Promise<number> {
  const u = await requireUser();
  const keep = await currentSessionHash();
  const r = await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", u.id, keep ?? "");
  await audit(u.id, "signed_out_others", `${r.changes} device${r.changes === 1 ? "" : "s"}`);
  return r.changes;
}

/** Step 1: a fresh secret, held (encrypted) but not active until a code proves the app has it. */
export async function startTwoFactor(): Promise<{ qr: string; secret: string } | null> {
  const u = await requireUser();
  if (u.totp_enabled_at) return null;
  const secret = newTotpSecret();
  await q.run("UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ? AND totp_enabled_at IS NULL", sealSecret(secret, env.secret), u.id);
  const qr = await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 220, color: { dark: "#10110f", light: "#f1f1eb" } });
  return { qr, secret };
}

/** Step 2: the first code turns it on. Returns recovery codes, shown once. */
export async function confirmTwoFactor(code: string): Promise<{ codes?: string[]; error?: string }> {
  const u = await requireUser();
  const row = await q.get<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ? AND totp_enabled_at IS NULL", u.id);
  if (!row?.totp_secret) return { error: "Start again: set-up expired." };
  const step = verifyTotp(openSecret(row.totp_secret, env.secret), String(code || ""), null);
  if (step == null) return { error: "That code didn't match. Check the time on your phone and try the newest code." };
  const codes = newRecoveryCodes();
  await q.run(
    "UPDATE users SET totp_enabled_at = ?, totp_last_step = ?, recovery_codes = ? WHERE id = ?",
    now(),
    step,
    JSON.stringify(codes.map(hashRecovery)),
    u.id,
  );
  await audit(u.id, "two_factor_on");
  done();
  return { codes };
}

/** Turning it off needs the password and a current code (or a recovery code). */
export async function disableTwoFactor(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireUser();
  const row = await q.get<{ password_hash: string; totp_secret: string | null; totp_last_step: number | null; recovery_codes: string }>(
    "SELECT password_hash, totp_secret, totp_last_step, recovery_codes FROM users WHERE id = ?",
    u.id,
  );
  if (!row || !verifyPassword(String(form.get("password") || ""), row.password_hash)) return { error: "Your password isn't right." };
  const code = String(form.get("code") || "");
  const ok =
    (row.totp_secret && verifyTotp(openSecret(row.totp_secret, env.secret), code, row.totp_last_step) != null) ||
    (JSON.parse(row.recovery_codes || "[]") as string[]).includes(hashRecovery(code));
  if (!ok) return { error: "That code didn't work." };
  await q.run("UPDATE users SET totp_enabled_at = NULL, totp_secret = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ?", u.id);
  await audit(u.id, "two_factor_off");
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "Two-factor sign-in was turned off",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nTwo-factor sign-in was just turned off for your FloorTest account.\n\nIf this wasn't you, reset your password now and turn it back on in Settings.\n\n— FloorTest`,
  });
  done();
  return { ok: true };
}

export async function setSigninAlerts(on: boolean) {
  const u = await requireUser();
  await q.run("UPDATE users SET signin_alerts = ? WHERE id = ?", on ? 1 : 0, u.id);
  await audit(u.id, on ? "signin_alerts_on" : "signin_alerts_off");
  done();
}
