/** Where a passkey belongs: the site's domain (rpID) and the exact address the browser must be on (origin). */
export type RelyingParty = { rpID: string; origin: string };

/**
 * Picks the relying party for the host a request came to. Only the app's own address counts, plus, on a preview,
 * that deployment's own Vercel addresses (`extra`, bare hosts without a scheme). Anything else gets null, so a
 * passkey can never be made or used for another site's name.
 */
export function pickRelyingParty(host: string | null, appUrl: string, extra: (string | undefined)[] = []): RelyingParty | null {
  if (!host) return null;
  const want = host.trim().toLowerCase();
  const app = new URL(appUrl);
  if (want === app.host.toLowerCase()) return { rpID: app.hostname, origin: app.origin };
  for (const e of extra) {
    if (!e) continue;
    const h = e.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    if (h && want === h && h.endsWith(".vercel.app")) return { rpID: h, origin: `https://${h}` };
  }
  return null;
}
