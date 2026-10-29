import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { normalEmail } from "./email-normal";
import { afterResponse, APP_URL, sendMailLater } from "./mail";
import { hashToken } from "./token-hash";

/**
 * The private link to a sender's history page (/sent/<id>). The id is random and says nothing about who it is for; only
 * its hash is kept, with the email and an expiry, in sender_links (H78, 29 Oct), so it can be ended early. Links made
 * before this carried the email in the URL; they are refused and show the "expired" page, which offers a new one.
 */
const TTL_MS = 24 * 3_600_000;

export async function createSenderLink(email: string, ttlMs = TTL_MS) {
  const id = crypto.randomBytes(24).toString("base64url");
  const at = now();
  await q.run("INSERT INTO sender_links (id_hash, email, created_at, expires_at) VALUES (?,?,?,?)", hashToken(id), normalEmail(email), at, at + ttlMs);
  return id;
}

/** The email a live link is for, or null (unknown, ended, expired, or an old-style link). */
export async function readSenderLink(id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
  const row = await q.get<{ email: string }>("SELECT email FROM sender_links WHERE id_hash = ? AND revoked_at IS NULL AND expires_at > ?", hashToken(id), now());
  return row?.email ?? null;
}

/** Ends one link now ("End this link" on the page). */
export async function revokeSenderLink(id: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return false;
  const r = await q.run("UPDATE sender_links SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL", now(), hashToken(id));
  return r.changes > 0;
}

/** Ends every live link for an address (support, or a sender whose inbox was exposed). */
export async function revokeSenderLinksFor(email: string) {
  const r = await q.run("UPDATE sender_links SET revoked_at = ? WHERE lower(email) = ? AND revoked_at IS NULL AND expires_at > ?", now(), normalEmail(email), now());
  return r.changes;
}

/**
 * Emails the /sent link if this address has sent music, after the response. The lookup happens then too, so the form
 * answers in the same time whether or not the address is a sender.
 */
export function sendSenderLinkLater(email: string) {
  afterResponse(async () => {
    if (!(await q.get("SELECT 1 FROM senders WHERE lower(email) = ?", email))) return;
    const link = await createSenderLink(email);
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
