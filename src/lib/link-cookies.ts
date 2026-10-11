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
const provenName = (linkId: number) => `ft_lp_${linkId}`;
const sessionName = (linkId: number) => `ft_ls_${linkId}`;

export async function setProvenEmail(linkId: number, email: string) {
  const body = `${linkId}.${Buffer.from(email).toString("base64url")}.${Date.now() + PROVEN_MS}`;
  (await cookies()).set(provenName(linkId), `${body}.${sign(body)}`, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: PROVEN_MS / 1000 });
}

export async function provenEmail(linkId: number): Promise<string | null> {
  const parts = ((await cookies()).get(provenName(linkId))?.value ?? "").split(".");
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
}

export async function linkSessionSecret(linkId: number) {
  return (await cookies()).get(sessionName(linkId))?.value;
}
