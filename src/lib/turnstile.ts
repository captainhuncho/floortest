import "server-only";
import { recordIncident } from "./incidents";

/**
 * Cloudflare Turnstile: a free, mostly invisible bot check on public forms.
 * Off until TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY (or NEXT_PUBLIC_TURNSTILE_SITE_KEY) are set; rate limits still apply either way.
 */
/** On since 1 Oct 2026, after floortest.imullar.com was added to the widget's hostnames. */
export const TURNSTILE_READY = true;
export const turnstileOn = () => TURNSTILE_READY && !!process.env.TURNSTILE_SECRET_KEY && !!(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY);

export async function passedTurnstile(token: unknown, ip?: string) {
  if (!turnstileOn()) return true;
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
