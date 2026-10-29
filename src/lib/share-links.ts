import "server-only";
import crypto from "node:crypto";
import { now, q, type Collection, type Queryable, type Track, type User } from "./db";
import { env } from "./env";
import { allow } from "./ratelimit";
import { switchOn } from "./switches";
import { normalEmail } from "./email-normal";

/**
 * Collection share links (sharing phase 2). A link is its own thing: a random ID (only a fingerprint stored),
 * separate from the submission link, with a permission (Listen, or Listen + Download), an expiry, and a list of named
 * recipients (an email, a company domain, or a FloorTest account). Nobody listens anonymously: getting in takes a
 * verified email that's on the list (an email code, or a signed-in account with a confirmed email), and accepting
 * the access notice. Access is a short session tied to the link's current generation: reset or revoke the link, or
 * remove the person, and it ends at once. People not on the list can ask to join; the owner approves or declines.
 * Every check runs on the server; the whole thing sits behind the "sharing" switch.
 */

export type Permission = "listen" | "download";
export const PERMISSIONS: Record<Permission, string> = { listen: "Listen", download: "Listen + Download" };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Recommended for unreleased music: two weeks. */
export const DEFAULT_LINK_DAYS = 14;
/** How long one verified visit lasts before the code (or sign-in) is asked again. */
export const SESSION_MS = 12 * HOUR;
const CODE_TTL = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
/** Request limits (see docs/06-plan.md, Controlled collection sharing). */
export const REQUESTS_PER_EMAIL_PER_DAY = 2;
export const REQUESTS_PER_NETWORK_PER_HOUR = 10;
export const REQUEST_COOLDOWN_DAYS = 30;
export const PAUSE_REQUESTS_AT = 20;
/** Bump when the access notice wording changes, so the next visit asks again. */
export const NOTICE_VERSION = "2026-10-11b";
export const ACCESS_NOTICE =
  "This collection may contain confidential or unreleased music. Your access is personal and can be ended at any time. Don't forward the link or code, or record, publish, reproduce, distribute or share the audio. If downloads are enabled for you, use the files only for the purpose they were shared for and delete them when asked. The owner can see when you open this collection and what you play and download.";

export type Link = {
  id: number;
  collection_id: number;
  created_by: number;
  label: string;
  generation: number;
  permission: Permission;
  requests_on: number;
  requests_paused_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
};
export type Recipient = { id: number; link_id: number; kind: "email" | "domain" | "user"; value: string; permission: Permission; expires_at: number | null; added_at: number; removed_at: number | null };

export class LinkError extends Error {}

const fingerprint = (secret: string) => crypto.createHash("sha256").update(secret, "utf8").digest("hex");
const newSecret = () => crypto.randomBytes(24).toString("base64url");
const codeHash = (linkId: number, email: string, code: string) => crypto.createHmac("sha256", env.secret).update(`link-code:${linkId}:${email}:${code}`).digest("base64url");
const cleanEmail = (e: string) => normalEmail(e).slice(0, 200);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Personal email providers can't be added as a "company domain": that would let almost anyone in. */
const PUBLIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mail.com", "yandex.com", "zoho.com"]);
export const linkUrl = (secret: string) => `${env.appUrl}/c/${secret}`;
/** The lower of two permissions: a recipient never gets more than the link allows. */
const lower = (a: Permission, b: Permission): Permission => (a === "download" && b === "download" ? "download" : "listen");

export async function sharingOn() {
  return switchOn("sharing");
}

export async function logLinkEvent(linkId: number, kind: string, who: { email?: string | null; userId?: number | null } = {}, trackId: number | null = null, detail = "") {
  await q.run("INSERT INTO link_events (link_id, email, user_id, kind, track_id, detail, created_at) VALUES (?,?,?,?,?,?,?)", linkId, who.email ?? null, who.userId ?? null, kind, trackId, detail, now());
}

/* ── The owner's side ── */

async function ownedLink(owner: Pick<User, "id">, linkId: number) {
  return q.get<Link>("SELECT l.* FROM collection_links l JOIN collections c ON c.id = l.collection_id WHERE l.id = ? AND c.user_id = ?", linkId, owner.id);
}

/** A new link. The full address is returned once, now; only its fingerprint is kept. */
export async function createLink(owner: Pick<User, "id">, collectionId: number, opts: { permission: Permission; days: number | null; requests: boolean; label?: string }) {
  if (!(await sharingOn())) throw new LinkError("Sharing isn't available yet.");
  const c = await q.get<Collection>("SELECT * FROM collections WHERE id = ? AND user_id = ?", collectionId, owner.id);
  if (!c) throw new LinkError("Not found");
  if (!(await allow("link_create", String(owner.id), 30, DAY))) throw new LinkError("Too many new links today. Try again tomorrow.");
  const secret = newSecret();
  const link = (await q.get<Link>(
    `INSERT INTO collection_links (collection_id, created_by, label, token_hash, permission, requests_on, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING *`,
    c.id,
    owner.id,
    (opts.label ?? "").trim().slice(0, 60),
    fingerprint(secret),
    opts.permission === "download" ? "download" : "listen",
    opts.requests ? 1 : 0,
    opts.days ? now() + opts.days * DAY : null,
    now(),
  ))!;
  await logLinkEvent(link.id, "created", { userId: owner.id });
  return { link, url: linkUrl(secret) };
}

/** Reset: a new address and generation. The old address stops working and everyone signed in through it is signed out. */
export async function resetLink(owner: Pick<User, "id">, linkId: number) {
  const link = await ownedLink(owner, linkId);
  if (!link || link.revoked_at) throw new LinkError("Not found");
  const secret = newSecret();
  await q.tx(async (db) => {
    await db.run("UPDATE collection_links SET token_hash = ?, generation = generation + 1, requests_paused_at = NULL WHERE id = ?", fingerprint(secret), link.id);
    await db.run("UPDATE link_sessions SET revoked_at = ? WHERE link_id = ? AND revoked_at IS NULL", now(), link.id);
  });
  await logLinkEvent(link.id, "reset", { userId: owner.id });
  return linkUrl(secret);
}

/** Revoke: the link stops working for everyone, for good. The collection and its music are untouched; history is kept. */
export async function revokeLink(owner: Pick<User, "id">, linkId: number) {
  const link = await ownedLink(owner, linkId);
  if (!link) throw new LinkError("Not found");
  await q.tx(async (db) => {
    await db.run("UPDATE collection_links SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?", now(), link.id);
    await db.run("UPDATE link_sessions SET revoked_at = ? WHERE link_id = ? AND revoked_at IS NULL", now(), link.id);
  });
  await logLinkEvent(link.id, "revoked", { userId: owner.id });
}

export async function setRequests(owner: Pick<User, "id">, linkId: number, on: boolean) {
  const link = await ownedLink(owner, linkId);
  if (!link) throw new LinkError("Not found");
  await q.run("UPDATE collection_links SET requests_on = ?, requests_paused_at = NULL WHERE id = ?", on ? 1 : 0, link.id);
}

/**
 * Adds people, one per line or comma: an email, a company domain ("@label.com", anyone with a verified address there),
 * or a FloorTest username ("@sam"; access follows the account). Returns what couldn't be added.
 */
export async function addRecipients(owner: Pick<User, "id">, linkId: number, raw: string, permission: Permission, days: number | null = null) {
  const link = await ownedLink(owner, linkId);
  if (!link || link.revoked_at) throw new LinkError("Not found");
  const problems: string[] = [];
  const accounts: number[] = [];
  let added = 0;
  for (const part of raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 100)) {
    let kind: Recipient["kind"];
    let value: string;
    if (EMAIL.test(part)) {
      kind = "email";
      value = cleanEmail(part);
    } else if (/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(part)) {
      value = part.replace(/^@/, "").toLowerCase();
      if (PUBLIC_DOMAINS.has(value)) {
        problems.push(`${part}: a personal email provider can't be a company domain; add the person's address instead`);
        continue;
      }
      kind = "domain";
    } else if (/^@?[a-z0-9_-]{2,30}$/i.test(part)) {
      const u = await q.get<{ id: number }>("SELECT id FROM users WHERE handle = ? AND suspended_at IS NULL", part.replace(/^@/, "").toLowerCase());
      if (!u) {
        problems.push(`${part}: no FloorTest account with that username`);
        continue;
      }
      if (u.id === owner.id) continue;
      kind = "user";
      value = String(u.id);
    } else {
      problems.push(`${part}: not an email, @domain or @username`);
      continue;
    }
    const r = await q.run(
      `INSERT INTO link_recipients (link_id, kind, value, permission, expires_at, added_by, added_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
      link.id, kind, value, lower(link.permission, permission), days ? now() + days * DAY : null, owner.id, now(),
    );
    if (r.changes) {
      added++;
      if (kind === "user") accounts.push(Number(value));
      await logLinkEvent(link.id, "recipient_added", { email: kind === "user" ? null : value, userId: kind === "user" ? Number(value) : null }, null, kind);
    }
  }
  return { added, problems, accounts };
}

/** Removes one person: their access ends at once, everyone else keeps theirs. */
export async function removeRecipient(owner: Pick<User, "id">, recipientId: number) {
  const r = await q.get<Recipient & { link_owner: number }>(
    "SELECT r.*, c.user_id AS link_owner FROM link_recipients r JOIN collection_links l ON l.id = r.link_id JOIN collections c ON c.id = l.collection_id WHERE r.id = ?",
    recipientId,
  );
  if (!r || r.link_owner !== owner.id) throw new LinkError("Not found");
  await q.tx(async (db) => {
    await db.run("UPDATE link_recipients SET removed_at = COALESCE(removed_at, ?) WHERE id = ?", now(), r.id);
    await db.run("UPDATE link_sessions SET revoked_at = ? WHERE recipient_id = ? AND revoked_at IS NULL", now(), r.id);
  });
  await logLinkEvent(r.link_id, "recipient_removed", { email: r.kind === "user" ? null : r.value, userId: r.kind === "user" ? Number(r.value) : null });
}

/** Approve (with what they get, never more than the link) or decline (30-day cooldown) or block (never again for this collection). */
export async function decideRequest(owner: Pick<User, "id">, requestId: number, decision: "approve" | "decline" | "block", opts: { permission?: Permission; days?: number | null } = {}) {
  const req = await q.get<{ id: number; link_id: number; email: string; user_id: number | null; status: string; owner_id: number; link_permission: Permission }>(
    `SELECT r.*, c.user_id AS owner_id, l.permission AS link_permission FROM link_requests r JOIN collection_links l ON l.id = r.link_id JOIN collections c ON c.id = r.collection_id WHERE r.id = ?`,
    requestId,
  );
  if (!req || req.owner_id !== owner.id) throw new LinkError("Not found");
  if (req.status !== "pending" && decision === "approve") throw new LinkError("This request was already answered.");
  const status = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "blocked";
  await q.run("UPDATE link_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?", status, now(), owner.id, req.id);
  if (decision === "approve") {
    const days = opts.days === undefined ? DEFAULT_LINK_DAYS : opts.days;
    await q.run(
      `INSERT INTO link_recipients (link_id, kind, value, permission, expires_at, added_by, added_at, request_id) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
      req.link_id,
      req.user_id ? "user" : "email",
      req.user_id ? String(req.user_id) : req.email,
      lower(req.link_permission, opts.permission ?? "listen"),
      days ? now() + days * DAY : null,
      owner.id,
      now(),
      req.id,
    );
  }
  await logLinkEvent(req.link_id, `request_${status}`, { email: req.email, userId: req.user_id });
  return { ...req, status };
}

/* ── The recipient's side ── */

/** A live link by the address someone opened, or undefined. Same answer for "never existed", "revoked" and "expired". */
export async function linkBySecret(secret: string) {
  if (!secret || secret.length > 100 || !(await sharingOn())) return undefined;
  const link = await q.get<Link & { collection_name: string; owner_id: number; owner_name: string }>(
    `SELECT l.*, c.name AS collection_name, c.user_id AS owner_id, u.name AS owner_name FROM collection_links l
     JOIN collections c ON c.id = l.collection_id JOIN users u ON u.id = c.user_id
     WHERE l.token_hash = ? AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?) AND u.suspended_at IS NULL`,
    fingerprint(secret),
    now(),
  );
  return link;
}

/**
 * Account holders on a link's list open it by its number instead of its address: `/c/a.<id>` (a "." never appears in
 * a link address). It works only for a signed-in account with a confirmed email that is on the list right now, so
 * resetting the address doesn't lock out the named accounts, and the number is useless to anyone else.
 */
const ACCOUNT_KEY = /^a\.(\d{1,12})$/;
export const accountLinkPath = (linkId: number) => `/c/a.${linkId}`;
type Viewer = { id: number; email: string; email_verified_at: number | null } | null | undefined;

export async function linkForAccount(linkId: number, viewer: Viewer) {
  if (!viewer?.email_verified_at || !(await sharingOn())) return undefined;
  const link = await q.get<Link & { collection_name: string; owner_id: number; owner_name: string }>(
    `SELECT l.*, c.name AS collection_name, c.user_id AS owner_id, u.name AS owner_name FROM collection_links l
     JOIN collections c ON c.id = l.collection_id JOIN users u ON u.id = c.user_id
     WHERE l.id = ? AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?) AND u.suspended_at IS NULL`,
    linkId,
    now(),
  );
  if (!link || link.owner_id === viewer.id) return undefined;
  return (await recipientFor(link, { email: viewer.email, userId: viewer.id })) ? link : undefined;
}

/** A link by what's in the address bar: its secret address, or (for account holders on the list) its number. */
export async function linkByKey(key: string, viewer: Viewer) {
  const m = ACCOUNT_KEY.exec(key);
  return m ? linkForAccount(Number(m[1]), viewer) : linkBySecret(key);
}

/** Collections shared with this account through share links (by username, confirmed email or company domain). */
export async function sharedLinksFor(viewer: Viewer) {
  if (!viewer?.email_verified_at || !(await sharingOn())) return [];
  const email = cleanEmail(viewer.email);
  const rows = await q.all<{ id: number; collection_name: string; owner_name: string; permission: Permission; recipient_permission: Permission; link_expires: number | null; recipient_expires: number | null; added_at: number; count: number }>(
    `SELECT DISTINCT ON (l.id) l.id, c.name AS collection_name, u.name AS owner_name, l.permission, r.permission AS recipient_permission,
       l.expires_at AS link_expires, r.expires_at AS recipient_expires, r.added_at,
       (SELECT COUNT(*)::int FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.file_key IS NOT NULL AND t.share_ok = 1 AND t.share_terms IS NOT NULL) AS count
     FROM link_recipients r JOIN collection_links l ON l.id = r.link_id JOIN collections c ON c.id = l.collection_id JOIN users u ON u.id = c.user_id
     WHERE r.removed_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > ?) AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?)
       AND u.suspended_at IS NULL AND c.user_id <> ?
       AND ((r.kind = 'user' AND r.value = ?) OR (r.kind = 'email' AND r.value = ?) OR (r.kind = 'domain' AND r.value = ?))
     ORDER BY l.id, r.added_at DESC`,
    now(), now(), viewer.id, String(viewer.id), email, email.split("@")[1] ?? "",
  );
  return rows.map((r) => {
    const ends = [r.link_expires, r.recipient_expires].filter((x): x is number => x !== null).map(Number);
    return { id: r.id, collection_name: r.collection_name, owner_name: r.owner_name, count: Number(r.count), permission: lower(r.permission, r.recipient_permission), expires_at: ends.length ? Math.min(...ends) : null, added_at: Number(r.added_at), href: accountLinkPath(r.id) };
  });
}

/** The live recipient entry this verified person matches (account, exact email, or company domain), with what they may do. */
export async function recipientFor(link: Pick<Link, "id" | "permission">, who: { email: string | null; userId: number | null }) {
  const email = who.email ? cleanEmail(who.email) : null;
  const domain = email?.split("@")[1] ?? null;
  // The last clause: added by username but verified by email code, where the code went to that account's confirmed address.
  const rows = await q.all<Recipient>(
    `SELECT * FROM link_recipients WHERE link_id = ? AND removed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       AND ((kind = 'user' AND value = ?) OR (kind = 'email' AND value = ?) OR (kind = 'domain' AND value = ?)
         OR (kind = 'user' AND value IN (SELECT CAST(id AS text) FROM users WHERE lower(email) = ? AND email_verified_at IS NOT NULL AND suspended_at IS NULL)))`,
    link.id, now(), who.userId ? String(who.userId) : "", email ?? "", domain ?? "", email ?? "",
  );
  // The most specific match wins: the account, then the exact email, then the domain.
  const r = rows.find((x) => x.kind === "user") ?? rows.find((x) => x.kind === "email") ?? rows.find((x) => x.kind === "domain");
  return r ? { recipient: r, permission: lower(link.permission, r.permission) } : undefined;
}

/** Emails a 6-digit code to prove the address before anything (getting in, or asking to). Neutral about whether it's on the list. */
export async function sendLinkCode(link: Pick<Link, "id">, rawEmail: string, ip: string, send: (to: string, code: string) => Promise<void>) {
  const email = cleanEmail(rawEmail);
  if (!EMAIL.test(email)) throw new LinkError("Enter a valid email.");
  if (!(await allow("link_code_email", email, 5, HOUR))) throw new LinkError("Too many codes for this email. Try again in an hour.");
  if (!(await allow("link_code_ip", ip, 20, HOUR))) throw new LinkError("Too many codes from this connection. Try again in an hour.");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q.run(
    `INSERT INTO link_codes (link_id, email, code_hash, expires_at, attempts, created_at) VALUES (?,?,?,?,0,?)
     ON CONFLICT (link_id, email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    link.id, email, codeHash(link.id, email, code), now() + CODE_TTL, now(),
  );
  await send(email, code);
}

/** Checks a typed code (right once, then used up; five wrong tries and a new code is needed). Returns the proven email. */
export async function checkLinkCode(link: Pick<Link, "id">, rawEmail: string, code: string) {
  const email = cleanEmail(rawEmail);
  // Counted before comparing, in one statement, so guesses sent at the same moment can't all get past the limit.
  const row = await q.get<{ code_hash: string; attempts: number }>(
    "UPDATE link_codes SET attempts = attempts + 1 WHERE link_id = ? AND email = ? AND expires_at >= ? AND attempts < ? RETURNING code_hash, attempts",
    link.id,
    email,
    now(),
    MAX_CODE_ATTEMPTS,
  );
  if (!row) {
    const used = await q.get("SELECT 1 FROM link_codes WHERE link_id = ? AND email = ? AND expires_at >= ?", link.id, email, now());
    throw new LinkError(used ? "Too many wrong tries. Send a new code." : "That code has expired. Send a new one.");
  }
  const want = Buffer.from(row.code_hash);
  const got = Buffer.from(codeHash(link.id, email, String(code).replace(/\D/g, "")));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got))
    throw new LinkError(row.attempts >= MAX_CODE_ATTEMPTS ? "Too many wrong tries. Send a new code." : "That code isn't right. Check the email and try again.");
  if (!(await q.run("DELETE FROM link_codes WHERE link_id = ? AND email = ? AND code_hash = ?", link.id, email, row.code_hash)).changes)
    throw new LinkError("That code was already used. Send a new one.");
  return email;
}

/** Codes asked for addresses that aren't on the list, in an hour, before the owner is warned the address may be out. */
export const PROBES_BEFORE_ALERT = 10;

/**
 * Notes a code request for an address that isn't on the list. Many in an hour suggests the address has spread: returns
 * true the first time that happens in a day, so the owner is told once (bell + email), not on every request.
 */
export async function noteUnlistedCode(link: Pick<Link, "id" | "permission">, email: string) {
  if (await recipientFor(link, { email, userId: null })) return false;
  await logLinkEvent(link.id, "code_unlisted", { email });
  const n = Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM link_events WHERE link_id = ? AND kind = 'code_unlisted' AND created_at > ?", link.id, now() - HOUR))?.n ?? 0);
  if (n < PROBES_BEFORE_ALERT) return false;
  if (await q.get("SELECT 1 FROM link_events WHERE link_id = ? AND kind = 'probed' AND created_at > ?", link.id, now() - DAY)) return false;
  await logLinkEvent(link.id, "probed", {}, null, `${n} unlisted in an hour`);
  return true;
}

/** Starts a verified visit once the notice is accepted. Returns the session secret for a cookie (only its fingerprint is kept). */
export async function startLinkSession(link: Pick<Link, "id" | "generation" | "expires_at">, recipient: Recipient, who: { email: string; userId: number | null }) {
  const secret = newSecret();
  const ends = Math.min(now() + SESSION_MS, link.expires_at ?? Infinity, recipient.expires_at ?? Infinity);
  await q.run(
    `INSERT INTO link_sessions (link_id, recipient_id, email, user_id, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    link.id, recipient.id, cleanEmail(who.email), who.userId, fingerprint(secret), link.generation, NOTICE_VERSION, now(), now(), ends,
  );
  await logLinkEvent(link.id, "verified", { email: who.email, userId: who.userId });
  return { secret, expires: ends };
}

/**
 * The visit behind a session cookie, re-checked on every request: same link generation (no reset since), not revoked,
 * not expired, the person still on the list, and (for account sessions) the account still in good standing.
 */
export async function linkSession(link: Pick<Link, "id" | "generation" | "permission">, secret: string | undefined, viewerId: number | null) {
  if (!secret) return undefined;
  const s = await q.get<{ id: number; email: string; user_id: number | null; recipient_id: number; generation: number }>(
    `SELECT s.* FROM link_sessions s JOIN link_recipients r ON r.id = s.recipient_id
     WHERE s.token_hash = ? AND s.link_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND r.removed_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > ?)`,
    fingerprint(secret), link.id, now(), now(),
  );
  if (!s || s.generation !== link.generation) return undefined;
  // A visit opened through a signed-in account lasts only while that account is signed in here: signing out (or
  // "sign out everywhere", a password change, an ops sign-out) ends it too.
  if (s.user_id && s.user_id !== viewerId) return undefined;
  if (s.user_id && !(await q.get("SELECT 1 FROM users WHERE id = ? AND suspended_at IS NULL", s.user_id))) return undefined;
  const r = await q.get<Recipient>("SELECT * FROM link_recipients WHERE id = ?", s.recipient_id);
  if (!r) return undefined;
  await q.run("UPDATE link_sessions SET last_seen_at = ? WHERE id = ?", now(), s.id);
  return { ...s, permission: lower(link.permission, r.permission) };
}

/**
 * Someone not on the list asks to join (after proving their email). Limits: one waiting request per email per link,
 * 2 a day per email, 10 an hour per connection, 30 days after a decline, never after a block, and a link that piles up
 * 20 waiting requests stops taking more (it may have leaked). Messages never describe the collection.
 */
export async function requestAccess(link: Link, who: { email: string; userId: number | null; name: string; note: string; ip: string }) {
  if (!link.requests_on) throw new LinkError("You don't have access to this collection.");
  if (link.requests_paused_at) throw new LinkError("This link isn't taking requests right now.");
  const email = cleanEmail(who.email);
  const decided = await q.get<{ status: string; decided_at: number }>(
    "SELECT status, decided_at FROM link_requests WHERE collection_id = ? AND email = ? AND status IN ('declined','blocked') ORDER BY decided_at DESC LIMIT 1",
    link.collection_id, email,
  );
  if (decided?.status === "blocked" || (decided && decided.decided_at > now() - REQUEST_COOLDOWN_DAYS * DAY)) throw new LinkError("You can't request this collection right now.");
  if (await q.get("SELECT 1 FROM link_requests WHERE link_id = ? AND email = ? AND status = 'pending'", link.id, email)) return { status: "waiting" as const };
  if (!(await allow("link_request_ip", `${link.collection_id}:${who.ip}`, REQUESTS_PER_NETWORK_PER_HOUR, HOUR))) throw new LinkError("Too many requests. Try again later.");
  if (!(await allow("link_request_email", email, REQUESTS_PER_EMAIL_PER_DAY, DAY))) throw new LinkError("Too many requests. Try again tomorrow.");
  await q.run(
    "INSERT INTO link_requests (link_id, collection_id, email, user_id, name, note, status, created_at) VALUES (?,?,?,?,?,?, 'pending', ?)",
    link.id, link.collection_id, email, who.userId, who.name.trim().slice(0, 80), who.note.trim().slice(0, 300), now(),
  );
  await logLinkEvent(link.id, "requested", { email, userId: who.userId });
  // A pile of waiting requests suggests the address got out: stop taking more and let the owner decide.
  const waiting = Number((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM link_requests WHERE link_id = ? AND status = 'pending'", link.id))?.n ?? 0);
  let paused = false;
  if (waiting >= PAUSE_REQUESTS_AT) {
    paused = !!(await q.run("UPDATE collection_links SET requests_paused_at = ? WHERE id = ? AND requests_paused_at IS NULL", now(), link.id)).changes;
    if (paused) await logLinkEvent(link.id, "requests_paused", {}, null, `${waiting} waiting`);
  }
  return { status: "sent" as const, paused };
}

/**
 * What someone opening a share link may learn about a track: the one place another person's tracks reach a visitor,
 * so the columns are named, never `*` (no sender, message, email or notes; audit 27 Oct, rule 2).
 * file_key and mime are for streaming and downloading on the server; the page shows only the rest.
 */
export const LINK_TRACK_COLUMNS = ["id", "title", "artist", "genre", "bpm", "duration", "file_key", "mime"] as const;
export type LinkTrack = Pick<Track, (typeof LINK_TRACK_COLUMNS)[number]>;
const linkTrackColumns = LINK_TRACK_COLUMNS.join(", ");

/** The tracks a link can play: this collection's live tracks whose sender agreed to sharing when they sent them. */
export async function linkTracks(link: Pick<Link, "collection_id">) {
  return q.all<LinkTrack>(
    `SELECT ${linkTrackColumns} FROM tracks WHERE collection_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL AND share_ok = 1 AND share_terms IS NOT NULL ORDER BY created_at DESC LIMIT 500`,
    link.collection_id,
  );
}

/** One track through a link, only if it's one of the link's tracks. */
export async function linkTrack(link: Pick<Link, "collection_id">, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  return q.get<LinkTrack>(`SELECT ${linkTrackColumns} FROM tracks WHERE id = ? AND collection_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL AND share_ok = 1 AND share_terms IS NOT NULL`, trackId, link.collection_id);
}

/** The owner's view of a collection's links: each with its recipients, waiting requests and recent activity. */
export async function linksFor(owner: Pick<User, "id">, collectionId: number) {
  const links = await q.all<Link>(
    "SELECT l.* FROM collection_links l JOIN collections c ON c.id = l.collection_id WHERE l.collection_id = ? AND c.user_id = ? ORDER BY l.revoked_at NULLS FIRST, l.created_at DESC",
    collectionId,
    owner.id,
  );
  return Promise.all(
    links.map(async (l) => ({
      ...l,
      recipients: await recipientsWithActivity(l.id),
      requests: await q.all<{ id: number; email: string; name: string; note: string; created_at: number; handle: string | null; verified: string | null }>(
        `SELECT r.id, r.email, r.name, r.note, r.created_at, u.handle, u.identity_status AS verified FROM link_requests r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.link_id = ? AND r.status = 'pending' ORDER BY r.created_at`,
        l.id,
      ),
      events: await q.all<{ kind: string; email: string | null; created_at: number; title: string | null }>(
        `SELECT e.kind, COALESCE(e.email, u.email) AS email, e.created_at, t.title FROM link_events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN tracks t ON t.id = e.track_id
         WHERE e.link_id = ? AND e.kind <> 'code_unlisted' ORDER BY e.created_at DESC LIMIT 12`,
        l.id,
      ),
    })),
  );
}

/**
 * Who's on a link and what each has done: visits (verified sessions), when last seen, tracks played, downloads, and
 * for a company domain, which addresses came in through it.
 */
async function recipientsWithActivity(linkId: number) {
  const rows = await q.all<Recipient & { name: string | null; handle: string | null; visits: number; last_seen: number | null }>(
    `SELECT r.*, u.name, u.handle, COUNT(s.id)::int AS visits, MAX(COALESCE(s.last_seen_at, s.created_at)) AS last_seen
     FROM link_recipients r LEFT JOIN users u ON r.kind = 'user' AND CAST(u.id AS text) = r.value LEFT JOIN link_sessions s ON s.recipient_id = r.id
     WHERE r.link_id = ? AND r.removed_at IS NULL GROUP BY r.id, u.name, u.handle ORDER BY r.added_at`,
    linkId,
  );
  const acts = await q.all<{ recipient_id: number; email: string; listened: number; downloaded: number }>(
    `SELECT s.recipient_id, s.email,
       (SELECT COUNT(DISTINCT e.track_id)::int FROM link_events e WHERE e.link_id = ? AND e.kind = 'listened' AND e.email = s.email) AS listened,
       (SELECT COUNT(*)::int FROM link_events e WHERE e.link_id = ? AND e.kind = 'downloaded' AND e.email = s.email) AS downloaded
     FROM (SELECT DISTINCT recipient_id, email FROM link_sessions WHERE link_id = ?) s`,
    linkId, linkId, linkId,
  );
  return rows.map((r) => {
    const mine = acts.filter((a) => a.recipient_id === r.id);
    return {
      ...r,
      visits: Number(r.visits),
      last_seen: r.last_seen === null ? null : Number(r.last_seen),
      listened: mine.reduce((n, a) => n + Number(a.listened), 0),
      downloaded: mine.reduce((n, a) => n + Number(a.downloaded), 0),
      people: r.kind === "domain" ? mine.map((a) => a.email) : [],
    };
  });
}

/** Owner's bell: who opened what for the first time, downloads, and security warnings about their links. */
export async function linkNoticesFor(ownerId: number, since: number) {
  return q.all<{ id: number; kind: string; email: string | null; detail: string; created_at: number; collection_id: number; collection: string; title: string | null }>(
    `SELECT e.id, e.kind, COALESCE(e.email, u.email) AS email, e.detail, e.created_at, c.id AS collection_id, c.name AS collection, t.title
     FROM link_events e JOIN collection_links l ON l.id = e.link_id JOIN collections c ON c.id = l.collection_id
     LEFT JOIN users u ON u.id = e.user_id LEFT JOIN tracks t ON t.id = e.track_id
     WHERE c.user_id = ? AND e.created_at > ? AND (e.kind IN ('downloaded', 'requests_paused', 'probed')
       OR (e.kind = 'verified' AND NOT EXISTS (SELECT 1 FROM link_events p WHERE p.link_id = e.link_id AND p.kind = 'verified' AND p.email = e.email AND p.id < e.id)))
     ORDER BY e.created_at DESC LIMIT 15`,
    ownerId,
    since,
  );
}

/**
 * How long share-link records are kept (proposed in the lawyer brief, S11; change here once the lawyer sets them).
 * Codes: a day. "Unknown address asked for a code" notes: 2 days (only the last hour is used). A link that ended
 * (revoked or expired) a year ago: everything about it, list, visits, activity and requests. Answered or stale
 * requests: a year. Declines and blocks stay while the collection exists, so the limits keep working.
 */
export const LINK_KEEP_DAYS = { codes: 1, unlistedNotes: 2, endedLinks: 365, requests: 365 } as const;

export async function purgeLinkRecords(t = now()) {
  const ago = (days: number) => t - days * DAY;
  const codes = await q.run("DELETE FROM link_codes WHERE expires_at < ?", ago(LINK_KEEP_DAYS.codes));
  const notes = await q.run("DELETE FROM link_events WHERE kind = 'code_unlisted' AND created_at < ?", ago(LINK_KEEP_DAYS.unlistedNotes));
  // A link's own row goes too: it cascades to its list, codes, visits, requests and activity.
  const links = await q.run(
    "DELETE FROM collection_links WHERE COALESCE(revoked_at, CASE WHEN expires_at < ? THEN expires_at END) < ?",
    t,
    ago(LINK_KEEP_DAYS.endedLinks),
  );
  const requests = await q.run(
    "DELETE FROM link_requests WHERE (status = 'approved' AND decided_at < ?) OR (status = 'pending' AND created_at < ?)",
    ago(LINK_KEEP_DAYS.requests),
    ago(LINK_KEEP_DAYS.requests),
  );
  return { codes: codes.changes ?? 0, notes: notes.changes ?? 0, links: links.changes ?? 0, requests: requests.changes ?? 0 };
}

/** On account deletion: the account's place on other people's links, and its visits, requests and activity. */
export async function forgetLinkPerson(db: Queryable, userId: number, email: string) {
  const e = cleanEmail(email);
  await db.run("DELETE FROM link_recipients WHERE kind = 'user' AND value = ?", String(userId));
  await db.run("DELETE FROM link_sessions WHERE user_id = ? OR email = ?", userId, e);
  await db.run("DELETE FROM link_events WHERE user_id = ? OR email = ?", userId, e);
  await db.run("DELETE FROM link_requests WHERE (user_id = ? OR email = ?) AND status NOT IN ('declined', 'blocked')", userId, e);
  await db.run("DELETE FROM link_codes WHERE email = ?", e);
}

/** For a data request: the collections shared with this address or account, and what it did through them. */
export async function linkDataFor(email: string, userId: number | null) {
  const e = cleanEmail(email);
  const domain = e.split("@")[1] ?? "";
  return {
    onLists: await q.all<Record<string, unknown>>(
      `SELECT c.name AS collection, u.name AS owner, r.kind, r.permission, r.added_at, r.removed_at FROM link_recipients r
       JOIN collection_links l ON l.id = r.link_id JOIN collections c ON c.id = l.collection_id JOIN users u ON u.id = c.user_id
       WHERE (r.kind = 'email' AND r.value = ?) OR (r.kind = 'domain' AND r.value = ?) OR (r.kind = 'user' AND r.value = ?) ORDER BY r.added_at`,
      e, domain, userId === null ? "" : String(userId),
    ),
    activity: await q.all<Record<string, unknown>>(
      `SELECT c.name AS collection, e.kind, t.title AS track, e.created_at FROM link_events e JOIN collection_links l ON l.id = e.link_id
       JOIN collections c ON c.id = l.collection_id LEFT JOIN tracks t ON t.id = e.track_id WHERE e.email = ? OR (e.user_id IS NOT NULL AND e.user_id = ?) ORDER BY e.created_at`,
      e, userId ?? -1,
    ),
    requests: await q.all<Record<string, unknown>>(
      "SELECT c.name AS collection, r.name, r.note, r.status, r.created_at, r.decided_at FROM link_requests r JOIN collections c ON c.id = r.collection_id WHERE r.email = ? ORDER BY r.created_at",
      e,
    ),
  };
}

/**
 * The sender stops private sharing of one track, from their receipt (the receipt's private link is the key). It drops
 * out of every share link at once; anyone who already downloaded it keeps their copy. The owner sees it in each
 * link's activity. One-way: to share it again the receiver has to ask the artist.
 */
export async function stopSharingByReceipt(token: string) {
  // Works the same once the track has left the desk (it's in no share link by then), so the receipt doesn't tell.
  const t = await q.get<{ id: number; collection_id: number | null; deleted_at: number | null }>(
    "UPDATE tracks SET share_ok = 0 WHERE token = ? AND share_ok = 1 RETURNING id, collection_id, deleted_at",
    String(token).slice(0, 100),
  );
  if (!t) return false;
  if (t.collection_id && !t.deleted_at)
    for (const l of await q.all<{ id: number }>("SELECT id FROM collection_links WHERE collection_id = ? AND revoked_at IS NULL", t.collection_id))
      await logLinkEvent(l.id, "sender_stopped", {}, t.id);
  return true;
}
