"use server";

/** Security: password, other devices, two-factor and sign-in alerts. */
import { allow } from "@/lib/ratelimit";
import { stepUp } from "@/lib/step-up";
import { passwordStrength } from "@/lib/password-strength";
import { changePasswordTo, currentSessionHash, verifyPassword, requireRole } from "@/lib/auth";
import { APP_URL, sendMail } from "@/lib/mail";
import { endSession } from "@/lib/sessions";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { hashRecovery, newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "@/lib/totp";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { done } from "./common";
import { unpinGoogle } from "@/lib/google-link";
import { type SettingsState } from "./settings";
import { breachedError } from "@/lib/breached";
import { turnOnTwoFactor } from "@/lib/two-factor";

/** Changes the password after checking the current one, and signs out every other device. */
export async function changePassword(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  if (!(await allow("password_change", String(u.id), 10, 3_600_000))) return { error: "Too many tries. Wait an hour and try again." };
  const current = String(form.get("current") || "");
  const next = String(form.get("password") || "");
  const denied = await stepUp(u.id, current, String(form.get("code") || ""));
  if (denied) return { error: denied };
  if (next === current) return { error: "Pick a password you haven't used here." };
  const strength = passwordStrength(next, [u.name, u.email, u.handle]);
  if (!strength.ok) return { error: strength.tip ?? "Choose a stronger password." };
  if (String(form.get("confirm") || "") !== next) return { error: "The two new passwords don't match." };
  const leaked = await breachedError(next);
  if (leaked) return { error: leaked };
  const keep = await currentSessionHash();
  // Every other browser, the app and the ops area are signed out, and unused reset links stop working.
  await changePasswordTo(u.id, next, keep);
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
  const u = await requireRole("owner");
  const keep = await currentSessionHash();
  const r = await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", u.id, keep ?? "");
  await audit(u.id, "signed_out_others", `${r.changes} device${r.changes === 1 ? "" : "s"}`);
  return r.changes;
}

/** Step 1: a fresh secret, held (encrypted) but not active until a code proves the app has it. */
export async function startTwoFactor(): Promise<{ qr: string; secret: string } | null> {
  const u = await requireRole("owner");
  if (u.totp_enabled_at) return null;
  const secret = newTotpSecret();
  await q.run("UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ? AND totp_enabled_at IS NULL", sealSecret(secret, env.secret), u.id);
  const qr = await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 220, color: { dark: "#10110f", light: "#f1f1eb" } });
  return { qr, secret };
}

/**
 * Step 2: the password and the first code turn it on. Returns recovery codes, shown once. The password matters: with a
 * borrowed session alone, someone could add their own authenticator and lock the owner out. Every other device is
 * signed out and the owner gets an email, as when it's turned off.
 */
export async function confirmTwoFactor(code: string, password: string): Promise<{ codes?: string[]; error?: string }> {
  const u = await requireRole("owner");
  const denied = await stepUp(u.id, String(password || ""), "");
  if (denied) return { error: denied };
  const on = await turnOnTwoFactor(u.id, code);
  if ("error" in on) return on;
  const { codes } = on;
  await q.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", u.id, (await currentSessionHash()) ?? "");
  await audit(u.id, "two_factor_on");
  await sendMail({
    userId: u.id,
    audience: "receiver",
    to: u.email,
    subject: "Two-factor sign-in was turned on",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nTwo-factor sign-in was just turned on for your FloorTest account, and every other device was signed out.\n\nIf this wasn't you, contact us straight away: ${APP_URL}/contact\n\n— FloorTest`,
  });
  done();
  return { codes };
}

/** Turning it off needs the password and a current code (or a recovery code). */
export async function disableTwoFactor(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  if (!(await allow("twofa_disable", String(u.id), 10, 3_600_000))) return { error: "Too many tries. Wait an hour and try again." };
  const row = await q.get<{ password_hash: string; totp_secret: string | null; totp_last_step: number | null; recovery_codes: string }>(
    "SELECT password_hash, totp_secret, totp_last_step, recovery_codes FROM users WHERE id = ?",
    u.id,
  );
  if (!row || !(await verifyPassword(String(form.get("password") || ""), row.password_hash))) return { error: "Your password isn't right." };
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
  const u = await requireRole("owner");
  await q.run("UPDATE users SET signin_alerts = ? WHERE id = ?", on ? 1 : 0, u.id);
  await audit(u.id, on ? "signin_alerts_on" : "signin_alerts_off");
  done();
}

/** Removes Google sign-in after checking the password (so a borrowed session can't quietly change how you sign in). */
export async function disconnectGoogle(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  if (!(await allow("google_unlink", String(u.id), 10, 3_600_000))) return { error: "Too many tries. Wait an hour and try again." };
  const row = await q.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id);
  if (!row || !(await verifyPassword(String(form.get("password") || ""), row.password_hash))) return { error: "Your password isn't right." };
  await unpinGoogle(u.id);
  done();
  return { ok: true };
}

/** Signs out one device from the list on the Security page. Not the current one: that's Sign out. */
export async function signOutDevice(hash: string): Promise<{ ok: true } | { error: string }> {
  const u = await requireRole("owner");
  const h = String(hash || "");
  if (!/^[a-f0-9]{64}$/.test(h)) return { error: "That device wasn't found." };
  if (h === (await currentSessionHash())) return { error: "To sign out this device, use Sign out." };
  if (!(await endSession(u.id, h))) return { error: "That device was already signed out." };
  await audit(u.id, "signed_out", "one device, from Security");
  done();
  return { ok: true };
}
