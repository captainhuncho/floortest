import "server-only";
import { env } from "./env";
import { recordIncident } from "./incidents";
import { record } from "./ratelimit";
import { switchOn } from "./switches";

/**
 * Cloudflare Turnstile: a free, mostly invisible bot check on public forms. On when the "Bot check" switch is on
 * (Admin → Feature switches) and both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set. Rate limits apply either way.
 */
export async function botCheckKey(): Promise<string | null> {
  if (!(await switchOn("bot_check"))) return null;
  const site = process.env.TURNSTILE_SITE_KEY;
  return site && process.env.TURNSTILE_SECRET_KEY ? site : null;
}

/**
 * Which form a check was solved for. Each widget carries its form's name and the server refuses a token solved for
 * another one, so a check passed on one form can't be spent on another.
 */
export type BotAction = "auth" | "send" | "contact" | "waitlist" | "reopen" | "newsletter" | "sent";

/**
 * Where a check may have been solved: this site's own addresses (the app, ops, this deployment), and on a developer's
 * machine localhost. Never localhost on the live site, so a token solved on someone's own computer doesn't count here.
 */
export function botHostnames() {
  const hosts = new Set<string>();
  for (const url of [env.appUrl, env.opsUrl]) {
    try {
      hosts.add(new URL(url).hostname);
    } catch {}
  }
  for (const h of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) if (h) hosts.add(h.trim());
  if (process.env.NODE_ENV !== "production") ["localhost", "127.0.0.1"].forEach((h) => hosts.add(h));
  else ["localhost", "127.0.0.1"].forEach((h) => hosts.delete(h));
  return hosts;
}

/**
 * Cloudflare's published test secrets (used by the e2e tests) answer with a dummy hostname and no form name. They can't
 * verify a real visitor's token, so trusting their answer as-is gives nothing away.
 */
const TEST_SECRETS = new Set(["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]);

/** Siteverify's answer passes only for the expected form, solved on one of this site's own addresses. */
export function turnstileAnswerOk(out: { success?: boolean; action?: string; hostname?: string }, action: BotAction, hosts = botHostnames()) {
  if (TEST_SECRETS.has(process.env.TURNSTILE_SECRET_KEY ?? "")) return !!out.success;
  return !!out.success && out.action === action && !!out.hostname && hosts.has(out.hostname);
}

export async function passedTurnstile(token: unknown, ip: string | undefined, action: BotAction) {
  if (!(await botCheckKey())) return true;
  // Failed checks go on Admin → Security (by connection, kept 48 hours like every rate-limit record).
  const failed = async () => {
    await record("bot_fail", ip && ip !== "unknown" ? ip : "unknown").catch(() => {});
    return false;
  };
  if (typeof token !== "string" || !token || token.length > 2048) return failed();
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const out = (await res.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
    if (turnstileAnswerOk(out, action)) return true;
    if (out.success) return failed(); // solved, but for another form or on another site
    // Our own setup is wrong (bad or missing secret): don't punish visitors for it. Let them through and raise it.
    const ours = (out["error-codes"] ?? []).filter((c) => c.includes("secret") || c === "internal-error");
    if (ours.length) {
      await recordIncident("server_error", "Bot check misconfigured; let a form through unchecked", ours.join(", "));
      return true;
    }
    return failed();
  } catch (e) {
    // Cloudflare unreachable: let people through (rate limits still hold), but record it so outages and abuse show up.
    console.error("[turnstile] verify failed", e);
    await recordIncident("server_error", "Bot check unavailable; let a form through unchecked", e instanceof Error ? e.message : String(e));
    return true;
  }
}

export const BOT_MESSAGE = "We couldn't confirm you're human. Wait for the check to finish, or reload the page and try again.";
