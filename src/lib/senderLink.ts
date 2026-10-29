import "server-only";
import crypto from "node:crypto";
import { q } from "./db";
import { env } from "./env";
import { afterResponse, APP_URL, sendMailLater } from "./mail";

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

/**
 * Emails the /sent link if this address has sent music, after the response. The lookup happens then too, so the form
 * answers in the same time whether or not the address is a sender.
 */
export function sendSenderLinkLater(email: string) {
  afterResponse(async () => {
    if (!(await q.get("SELECT 1 FROM senders WHERE lower(email) = ?", email))) return;
    const link = signSenderLink(email);
    await sendMailLater({
      userId: null,
      audience: "sender",
      to: email,
      secrets: [link],
      subject: "Your FloorTest sends",
      body: `Here's your private link to every track you've sent through FloorTest. It works for 24 hours:\n${APP_URL}/sent/${link}\n\nIf you didn't ask for this, ignore this email.\n\n— FloorTest`,
    });
  }, "[sent] couldn't email a sender link");
}
