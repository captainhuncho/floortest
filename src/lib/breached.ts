import crypto from "node:crypto";

/**
 * Leaked-password check against Have I Been Pwned's Pwned Passwords (k-anonymity): the password's SHA-1 is computed
 * here, only its first 5 hex characters are sent, and the matching suffixes come back to be compared on our side.
 * The password, and the rest of its hash, never leave the server. Padding is on, so the response size gives nothing away.
 *
 * Runs on Vercel (production and previews), or anywhere with PWNED_CHECK=1; PWNED_CHECK=0 turns it off. Off in local
 * development and tests, which shouldn't depend on an outside service.
 * Fails open: if the service is slow or down, the password is judged on its strength alone and the miss is logged.
 */
const ENDPOINT = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2500;

export const BREACHED_MESSAGE = "This password has turned up in a data breach on another site, so it's one of the first that attackers try. Choose a different one.";

export function pwnedCheckOn(env: Record<string, string | undefined> = process.env) {
  if (env.PWNED_CHECK === "0") return false;
  return env.PWNED_CHECK === "1" || env.VERCEL === "1";
}

/** How many times the password appears in known breaches; 0 when it doesn't; null when the check couldn't run. */
export async function timesBreached(password: string, fetcher: typeof fetch = fetch): Promise<number | null> {
  const sha1 = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetcher(ENDPOINT + prefix, {
      headers: { "Add-Padding": "true", "User-Agent": "FloorTest password check" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    for (const line of (await res.text()).split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix) return Number(n) || 0; // padding lines carry a count of 0
    }
    return 0;
  } catch (e) {
    console.warn("[breached] check skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The error to show when a new password is known to be leaked, or null to accept it. */
export async function breachedError(password: string): Promise<string | null> {
  if (!pwnedCheckOn()) return null;
  return ((await timesBreached(password)) ?? 0) > 0 ? BREACHED_MESSAGE : null;
}
