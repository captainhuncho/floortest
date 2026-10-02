import "server-only";
import { recordIncident } from "./incidents";
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

export async function passedTurnstile(token: unknown, ip?: string) {
  if (!(await botCheckKey())) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const out = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (out.success) return true;
    // Our own setup is wrong (bad or missing secret): don't punish visitors for it. Let them through and raise it.
    const ours = (out["error-codes"] ?? []).filter((c) => c.includes("secret") || c === "internal-error");
    if (ours.length) {
      await recordIncident("server_error", "Bot check misconfigured; let a form through unchecked", ours.join(", "));
      return true;
    }
    return false;
  } catch (e) {
    // Cloudflare unreachable: let people through (rate limits still hold), but record it so outages and abuse show up.
    console.error("[turnstile] verify failed", e);
    await recordIncident("server_error", "Bot check unavailable; let a form through unchecked", e instanceof Error ? e.message : String(e));
    return true;
  }
}

export const BOT_MESSAGE = "We couldn't confirm you're human. Wait for the check to finish, or reload the page and try again.";
