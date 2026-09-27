import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/** A 24-hour, signed "this is the owner of <email>" link for the sender history page. */
export function signSenderLink(email: string, ttlMs = 24 * 3_600_000) {
  const body = `${Buffer.from(email.toLowerCase()).toString("base64url")}.${Date.now() + ttlMs}`;
  return `${body}.${crypto.createHmac("sha256", env.secret).update(`sent:${body}`).digest("base64url")}`;
}

export function readSenderLink(token: string): string | null {
  const [e, exp, mac] = token.split(".");
  if (!e || !exp || !mac) return null;
  const want = crypto.createHmac("sha256", env.secret).update(`sent:${e}.${exp}`).digest("base64url");
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)) || Number(exp) < Date.now()) return null;
  return Buffer.from(e, "base64url").toString("utf8");
}
