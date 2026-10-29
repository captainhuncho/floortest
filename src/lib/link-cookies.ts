import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Cookies for collection share links. Two kinds, both http-only:
 * - "proven email" (10 minutes, signed): the address that just passed an email code for this link, so the next step
 *   (accepting the notice, or asking to join) knows who it is without asking again;
 * - the session (up to 12 hours): a random secret whose fingerprint is checked on every page and every audio request.
 */
const PROVEN_MS = 10 * 60_000;
const secure = () => env.appUrl.startsWith("https");
const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`link-proven:${body}`).digest("base64url");

type LinkCookie = "proven" | "session";
const BASE: Record<LinkCookie, string> = { proven: "ft_lp_", session: "ft_ls_" };

/**
 * On the live site both cookies carry the `__Host-` prefix, like the browser session (src/lib/sessions.ts): the browser
 * then sends them only over HTTPS, only to this exact host, and no subdomain can set or overwrite them. Locally (plain
 * http) they keep the plain name, which the browser would otherwise refuse.
 */
export const linkCookieName = (kind: LinkCookie, linkId: number, prod: boolean) => `${prod ? "__Host-" : ""}${BASE[kind]}${linkId}`;
/**
 * The old (unprefixed) names are still read, never written, until this date, so the rename ends nobody's link session.
 * A link session lasts at most 12 hours and a proven email 10 minutes; the date leaves room for the change to ship.
 * After it the fallback can be deleted outright.
 */
export const OLD_LINK_COOKIE_UNTIL = Date.UTC(2026, 11, 1);

/** A share-link cookie the browser sent: the current name, or (on the live site, until the cut-off) the old one. */
export function readLinkCookie(
  jar: { get(name: string): { value: string } | undefined },
  kind: LinkCookie,
  linkId: number,
  prod: boolean,
  at = Date.now(),
) {
  const current = jar.get(linkCookieName(kind, linkId, prod))?.value;
  if (current || !prod || at >= OLD_LINK_COOKIE_UNTIL) return current;
  return jar.get(linkCookieName(kind, linkId, false))?.value;
}

const provenName = (linkId: number) => linkCookieName("proven", linkId, secure());
const sessionName = (linkId: number) => linkCookieName("session", linkId, secure());

export async function setProvenEmail(linkId: number, email: string) {
  const body = `${linkId}.${Buffer.from(email).toString("base64url")}.${Date.now() + PROVEN_MS}`;
  (await cookies()).set(provenName(linkId), `${body}.${sign(body)}`, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: PROVEN_MS / 1000 });
}

export async function provenEmail(linkId: number): Promise<string | null> {
  const parts = (readLinkCookie(await cookies(), "proven", linkId, secure()) ?? "").split(".");
  if (parts.length !== 4) return null;
  const [id, e, exp, mac] = parts;
  const want = sign(`${id}.${e}.${exp}`);
  if (Number(id) !== linkId || want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)) || Number(exp) < Date.now()) return null;
  return Buffer.from(e, "base64url").toString("utf8");
}

export async function setLinkSession(linkId: number, secret: string, expires: number) {
  const c = await cookies();
  c.set(sessionName(linkId), secret, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: Math.max(60, Math.floor((expires - Date.now()) / 1000)) });
  c.delete(provenName(linkId));
  // A cookie left under an old name is dropped, so only the prefixed one is sent from now on.
  if (secure()) for (const kind of ["proven", "session"] as const) if (c.get(linkCookieName(kind, linkId, false))) c.delete(linkCookieName(kind, linkId, false));
}

export async function linkSessionSecret(linkId: number) {
  return readLinkCookie(await cookies(), "session", linkId, secure());
}
