import "server-only";
import { accountEmailAllowed } from "./email-budget";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { audit } from "./audit";
import { createSession } from "./auth";
import { now, q } from "./db";
import { env } from "./env";
import { APP_URL, sendMail } from "./mail";
import { requestIp } from "./ratelimit";
import { hashRecovery, openSecret, verifyTotp } from "./totp";
import { hashToken } from "./token-hash";

/** "Chrome on macOS" from a user-agent string; good enough for an alert email. */
export function deviceLabel(ua: string) {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "an unknown system";
  return `${browser} on ${os}`;
}

/** The last step of every sign-in: session, audit trail, and the optional alert email. */
export async function finishSignIn(userId: number, how: "password" | "two-factor" | "recovery code" | "reset" | "email code" | "Google") {
  await createSession(userId);
  await audit(userId, "signed_in", how === "password" ? "" : `with ${how}`);
  const u = await q.get<{ email: string; name: string; tz: string; signin_alerts: number }>(
    "SELECT email, name, tz, signin_alerts FROM users WHERE id = ?",
    userId,
  );
  if (!u?.signin_alerts) return;
  const device = deviceLabel((await headers()).get("user-agent") ?? "");
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: u.tz || "UTC" }).format(now());
  const ip = await requestIp();
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    subject: "New sign-in to FloorTest",
    body: [
      `Hi ${u.name.split(/\s+/)[0]},`,
      "",
      `Your FloorTest account was just signed in to.`,
      "",
      `When: ${when}`,
      `Device: ${device}`,
      ip !== "local" ? `Network: ${ip}` : "",
      how !== "password" ? `Method: ${how}` : "",
      "",
      "If this was you, there's nothing to do.",
      `If it wasn't, change your password and sign out other devices: ${APP_URL}/dashboard/settings/security`,
      "",
      `Turn these emails off in Settings.`,
      "",
      "— FloorTest",
    ]
      .filter((l, i, a) => l || a[i - 1])
      .join("\n"),
  });
}

/** Password was right and the account uses two-factor: check a 6-digit code or a recovery code. */
export async function checkSecondFactor(userId: number, input: string): Promise<"code" | "recovery" | null> {
  const row = await q.get<{ totp_secret: string | null; totp_last_step: number | null; recovery_codes: string }>(
    "SELECT totp_secret, totp_last_step, recovery_codes FROM users WHERE id = ? AND totp_enabled_at IS NOT NULL",
    userId,
  );
  if (!row?.totp_secret) return null;
  const step = verifyTotp(openSecret(row.totp_secret, env.secret), input, row.totp_last_step);
  if (step != null) {
    // Conditional update, so two requests racing with the same code can't both pass.
    const r = await q.run("UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)", step, userId, step);
    return r.changes ? "code" : null;
  }
  const codes: string[] = JSON.parse(row.recovery_codes || "[]");
  const h = hashRecovery(input);
  if (!codes.includes(h)) return null;
  const r = await q.run("UPDATE users SET recovery_codes = ? WHERE id = ? AND recovery_codes = ?", JSON.stringify(codes.filter((c) => c !== h)), userId, row.recovery_codes);
  return r.changes ? "recovery" : null;
}

/* Receiver email verification */

export async function sendEmailVerification(userId: number) {
  const token = crypto.randomBytes(24).toString("base64url");
  const u = await q.get<{ email: string; name: string }>(
    "UPDATE users SET email_verify_token = ? WHERE id = ? AND email_verified_at IS NULL RETURNING email, name",
    hashToken(token),
    userId,
  );
  if (!u || !(await accountEmailAllowed())) return false;
  await sendMail({
    userId,
    audience: "receiver",
    to: u.email,
    secrets: [token],
    subject: "Confirm your email for FloorTest",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nConfirm this is your email so password resets and alerts reach you:\n${APP_URL}/verify-email/${token}\n\n— FloorTest`,
  });
  return true;
}

