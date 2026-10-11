import "server-only";
import crypto from "node:crypto";
import { now, q, type Collection, type Track, type User } from "./db";
import { env } from "./env";
import { allow } from "./ratelimit";
import { switchOn } from "./switches";

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
export const NOTICE_VERSION = "2026-10-11";
export const ACCESS_NOTICE =
  "This collection may contain confidential or unreleased music. Your access is personal and revocable. You may not forward the link, publish, reproduce, distribute or share the audio unless the collection owner has expressly enabled that permission.";

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
const cleanEmail = (e: string) => e.trim().toLowerCase().slice(0, 200);
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
  let added = 0;
  for (const part of raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 100)) {
    let kind: Recipient["kind"];
    let value: string;
    if (EMAIL.test(part)) (kind = "email"), (value = cleanEmail(part));
    else if (/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(part)) {
      value = part.replace(/^@/, "").toLowerCase();
      if (PUBLIC_DOMAINS.has(value)) {
        problems.push(`${part}: a personal email provider can't be a company domain; add the person's address instead`);
        continue;
      }
      kind = "domain";
    }
    else if (/^@?[a-z0-9_-]{2,30}$/i.test(part)) {
      const u = await q.get<{ id: number }>("SELECT id FROM users WHERE handle = ? AND suspended_at IS NULL", part.replace(/^@/, "").toLowerCase());
      if (!u) {
        problems.push(`${part}: no FloorTest account with that username`);
        continue;
      }
      if (u.id === owner.id) continue;
      (kind = "user"), (value = String(u.id));
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
      await logLinkEvent(link.id, "recipient_added", { email: kind === "user" ? null : value, userId: kind === "user" ? Number(value) : null }, null, kind);
    }
  }
  return { added, problems };
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
  const row = await q.get<{ code_hash: string; expires_at: number; attempts: number }>("SELECT code_hash, expires_at, attempts FROM link_codes WHERE link_id = ? AND email = ?", link.id, email);
  if (!row || Number(row.expires_at) < now()) throw new LinkError("That code has expired. Send a new one.");
  if (row.attempts >= MAX_CODE_ATTEMPTS) throw new LinkError("Too many wrong tries. Send a new code.");
  const want = Buffer.from(row.code_hash);
  const got = Buffer.from(codeHash(link.id, email, String(code).replace(/\D/g, "")));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    await q.run("UPDATE link_codes SET attempts = attempts + 1 WHERE link_id = ? AND email = ?", link.id, email);
    throw new LinkError("That code isn't right. Check the email and try again.");
  }
  await q.run("DELETE FROM link_codes WHERE link_id = ? AND email = ?", link.id, email);
  return email;
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
export async function linkSession(link: Pick<Link, "id" | "generation" | "permission">, secret: string | undefined) {
  if (!secret) return undefined;
  const s = await q.get<{ id: number; email: string; user_id: number | null; recipient_id: number; generation: number }>(
    `SELECT s.* FROM link_sessions s JOIN link_recipients r ON r.id = s.recipient_id
     WHERE s.token_hash = ? AND s.link_id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND r.removed_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > ?)`,
    fingerprint(secret), link.id, now(), now(),
  );
  if (!s || s.generation !== link.generation) return undefined;
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
  if (waiting >= PAUSE_REQUESTS_AT) {
    await q.run("UPDATE collection_links SET requests_paused_at = ? WHERE id = ? AND requests_paused_at IS NULL", now(), link.id);
    await logLinkEvent(link.id, "requests_paused", {}, null, `${waiting} waiting`);
  }
  return { status: "sent" as const };
}

/** The tracks a link can play: this collection's live tracks whose sender agreed to sharing when they sent them. */
export async function linkTracks(link: Pick<Link, "collection_id">) {
  return q.all<Track>(
    "SELECT * FROM tracks WHERE collection_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL AND share_ok = 1 ORDER BY created_at DESC LIMIT 500",
    link.collection_id,
  );
}

/** One track through a link, only if it's one of the link's tracks. */
export async function linkTrack(link: Pick<Link, "collection_id">, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  return q.get<Track>("SELECT * FROM tracks WHERE id = ? AND collection_id = ? AND deleted_at IS NULL AND file_key IS NOT NULL AND share_ok = 1", trackId, link.collection_id);
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
      recipients: await q.all<Recipient & { name: string | null; handle: string | null }>(
        `SELECT r.*, u.name, u.handle FROM link_recipients r LEFT JOIN users u ON r.kind = 'user' AND u.id = CAST(r.value AS bigint)
         WHERE r.link_id = ? AND r.removed_at IS NULL ORDER BY r.added_at`,
        l.id,
      ),
      requests: await q.all<{ id: number; email: string; name: string; note: string; created_at: number; handle: string | null; verified: string | null }>(
        `SELECT r.id, r.email, r.name, r.note, r.created_at, u.handle, u.identity_status AS verified FROM link_requests r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.link_id = ? AND r.status = 'pending' ORDER BY r.created_at`,
        l.id,
      ),
      events: await q.all<{ kind: string; email: string | null; created_at: number; title: string | null }>(
        `SELECT e.kind, COALESCE(e.email, u.email) AS email, e.created_at, t.title FROM link_events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN tracks t ON t.id = e.track_id
         WHERE e.link_id = ? ORDER BY e.created_at DESC LIMIT 12`,
        l.id,
      ),
    })),
  );
}
