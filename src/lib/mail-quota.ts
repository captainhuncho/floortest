import "server-only";
import { q } from "./db";

/**
 * Resend's sending caps. The free plan allows 100 emails a day and 3,000 a month; over that, emails fail.
 * Set MAIL_DAILY_LIMIT and MAIL_MONTHLY_LIMIT in Vercel after upgrading.
 */
export const MAIL_LIMITS = {
  day: Number(process.env.MAIL_DAILY_LIMIT) || 100,
  month: Number(process.env.MAIL_MONTHLY_LIMIT) || 3000,
};
/** Warn at this share of either limit. */
export const MAIL_WARN_AT = 0.8;
/**
 * The share of the daily limit kept for account email (sign-in codes, resets, email checks and email changes): every
 * other email stops once the rest of the day is used. MAIL_RESERVED_SHARE, 0.1 to 0.9, default 0.3 (the same setting the
 * public-form budget in lib/email-budget reads, so the two agree).
 */
export const MAIL_RESERVED_SHARE = Math.min(0.9, Math.max(0.1, Number(process.env.MAIL_RESERVED_SHARE) || 0.3));

/** Emails actually handed to Resend today (UTC) and this calendar month, against the plan's caps. */
export async function mailUsage(at = Date.now()) {
  const d = new Date(at);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const [day, month] = await Promise.all([
    q.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND created_at >= ?", dayStart),
    q.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND created_at >= ?", monthStart),
  ]);
  const warn = day >= MAIL_LIMITS.day * MAIL_WARN_AT || month >= MAIL_LIMITS.month * MAIL_WARN_AT;
  return { day, month, limits: MAIL_LIMITS, warn };
}
