import crypto from "node:crypto";
import { env } from "./env";

/**
 * The "Coming soon" gate: with SITE_PASSWORD set, floortest.app shows only the coming-soon page until a visitor enters
 * the password. The pass is a cookie holding a hash of the password (keyed with APP_SECRET, never a fallback key), so changing the password
 * re-locks everyone, and the password itself never sits in a cookie. Remove SITE_PASSWORD to open the site.
 */
export const GATE_COOKIE = "ft_gate";
export const GATE_DAYS = 30;

export const gatePassword = () => (process.env.VERCEL_ENV === "preview" ? "" : (process.env.SITE_PASSWORD ?? "").trim());

export function gateToken(password = gatePassword()) {
  return crypto.createHmac("sha256", env.secret).update(`gate:${password}`).digest("base64url");
}

export function hasGatePass(cookie: string | undefined) {
  const pw = gatePassword();
  if (!pw) return true;
  if (!cookie) return false;
  const want = Buffer.from(gateToken(pw));
  const got = Buffer.from(cookie);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
