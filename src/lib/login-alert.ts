import "server-only";
import { now, q } from "./db";
import { afterResponse, APP_URL, sendMail } from "./mail";
import { allow, recentCount } from "./ratelimit";
import type { Hold } from "./login-limits";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Alerts a day: per account (so they can't be used to flood someone) and for everyone together (so a wave of guessing can't eat the day's email). */
const PER_ACCOUNT_A_DAY = 3;
const ALL_A_DAY = 200;

/**
 * Tells the account holder that someone is guessing their password (owner, 2 Nov): sent when a hold starts on their
 * email, at most once an hour and three times a day, whatever their sign-in alert setting (this is about attempts, not
 * sign-ins). Not from the share kept for sign-in codes and resets, so it can never crowd those out. Runs after the answer
 * has gone back, so how long the page takes never reveals that the email has an account.
 */
export function alertGuessedAccount(email: string, hold: Hold) {
  afterResponse(async () => {
    const u = await q.get<{ id: number; email: string; name: string; tz: string }>("SELECT id, email, name, tz FROM users WHERE email = ? AND suspended_at IS NULL", email);
    if (!u) return;
    const id = String(u.id);
    if ((await recentCount("login_alert", id, DAY)) >= PER_ACCOUNT_A_DAY || !(await allow("login_alert", id, 1, HOUR))) return;
    if (!(await allow("login_alert_all", "all", ALL_A_DAY, DAY))) return;
    const zone = { timeZone: u.tz || "UTC" };
    const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", ...zone }).format(now());
    const until = new Intl.DateTimeFormat("en-GB", { dateStyle: hold.final ? "medium" : undefined, timeStyle: "short", ...zone }).format(hold.until);
    await sendMail({
      userId: u.id,
      audience: "receiver",
      to: u.email,
      subject: "Wrong passwords on your FloorTest account",
      body: [
        `Hi ${u.name.split(/\s+/)[0] || "there"},`,
        "",
        `Someone typed the wrong password for your FloorTest account several times, so we've paused password tries from that device until ${until}.`,
        `When: ${when}`,
        "",
        "If it was you, wait for the pause to end, or get in now without your password:",
        `- Reset your password: ${APP_URL}/forgot`,
        `- Sign in with a code sent to this email: ${APP_URL}/login/code`,
        "",
        `If it wasn't you, those wrong passwords didn't get anyone in. To be sure, choose a new password and sign out other devices: ${APP_URL}/dashboard/settings/security`,
        "",
        `Need help? Reply to this email or write to us: ${APP_URL}/contact`,
        "",
        "— FloorTest",
      ].join("\n"),
    });
  }, "[login] guessed-account alert failed");
}
