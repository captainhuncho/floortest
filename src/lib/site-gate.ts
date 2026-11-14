import crypto from "node:crypto";
import { q } from "./db";
import { env } from "./env";
import { WEB_IDLE_MS } from "./sessions";
import { hashToken } from "./token-hash";

/**
 * The "Coming soon" gate: with SITE_PASSWORD set and the `site_lock` switch on (Admin → Feature switches, super admin
 * only), floortest.app shows only the coming-soon page until a visitor enters the password. The pass is a cookie holding
 * a hash of the password and the lock's generation (keyed with APP_SECRET, never a fallback key), so changing the
 * password or turning the lock off and on again re-locks everyone, and the password itself never sits in a cookie.
 * No SITE_PASSWORD: the site is open whatever the switch says. The switch can't be read: the site stays locked.
 * Every caller asks `gateLock()`; nothing else decides whether the site is locked.
 */
export const GATE_COOKIE = "ft_gate";
export const GATE_DAYS = 30;

/** The password from the environment ("" on previews and when unset). Only gateLock() and the unlock form read it. */
export const gatePassword = () => (process.env.VERCEL_ENV === "preview" ? "" : (process.env.SITE_PASSWORD ?? "").trim());

/**
 * `gen` is the lock generation: "" until an admin first flips `site_lock` (so passes made before the switch existed stay
 * good), then the switch row's updated_at.
 */
export function gateToken(password = gatePassword(), gen = "") {
  return crypto.createHmac("sha256", env.secret).update(gen ? `gate:${password}:${gen}` : `gate:${password}`).digest("base64url");
}

export type GateLock = { password: string; gen: string };
type LockRead = { on: boolean; gen: string };

/** How long the proxy trusts a read of the switch, and how long one read may take before it counts as failed. */
export const LOCK_CACHE_MS = 5_000;
export const LOCK_READ_TIMEOUT_MS = 1_500;
/** A failed read is remembered this long, so an outage costs one wait every 1.5 s, not one per request. */
export const LOCK_FAIL_CACHE_MS = 1_500;
/**
 * When a read fails (database waking, pool busy, outage), the last good read is used if it is at most this old, so a
 * slow moment doesn't lock out people who hold a pass. Older than that, or none yet: locked, and no pass is good.
 */
export const LOCK_LAST_GOOD_MS = 30_000;
/** A generation no pass is ever made for: used when the switch can't be read, so the site stays locked for everyone. */
const UNREADABLE = "unreadable";

let cached: { read: LockRead; at: number; ok: boolean } | null = null;
let lastGood: { read: LockRead; at: number } | null = null;
/** One read at a time, shared by every request that arrives while it runs. */
let inflight: { epoch: number; read: Promise<LockRead> } | null = null;
/** Bumped by forgetGateLock(): a read that started before a flip never caches the old state. */
let epoch = 0;
/** How many times the switch was read from the database (tests check reads are shared and failures cached). */
let reads = 0;
export const lockReads = () => reads;

async function readSwitch(): Promise<LockRead> {
  reads++;
  const row = await q.get<{ on: number; updated_at: number | string }>("SELECT on_ AS on, updated_at FROM switches WHERE key = ?", "site_lock");
  // No row: never flipped, so it is at its initial state (on) with the first generation.
  return row ? { on: !!Number(row.on), gen: String(row.updated_at) } : { on: true, gen: "" };
}

async function readWithTimeout(): Promise<LockRead> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readSwitch(),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("site_lock read timed out")), LOCK_READ_TIMEOUT_MS))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function lockState(): Promise<LockRead> {
  if (cached && Date.now() - cached.at < (cached.ok ? LOCK_CACHE_MS : LOCK_FAIL_CACHE_MS)) return Promise.resolve(cached.read);
  if (inflight && inflight.epoch === epoch) return inflight.read;
  const mine = epoch;
  const read: Promise<LockRead> = readWithTimeout().then(
    (r) => {
      if (mine === epoch) {
        cached = { read: r, at: Date.now(), ok: true };
        lastGood = { read: r, at: Date.now() };
      }
      return r;
    },
    (e) => {
      const recent = lastGood && Date.now() - lastGood.at <= LOCK_LAST_GOOD_MS ? lastGood.read : null;
      console.error(`[site-gate] couldn't read site_lock, ${recent ? "using the last good read" : "keeping the site locked"}`, e);
      const r = recent ?? { on: true, gen: UNREADABLE };
      if (mine === epoch) cached = { read: r, at: Date.now(), ok: false };
      return r;
    },
  );
  inflight = { epoch: mine, read };
  void read.finally(() => {
    if (inflight?.read === read) inflight = null;
  });
  return read;
}

/**
 * Forgets everything read so far, so this process sees a flip on its next request (the admin action calls it; tests
 * too). Other instances, and the proxy's own copy of this module, see it when their cache runs out: within ~5 s
 * everywhere, up to ~6.5 s if a read was under way.
 */
export function forgetGateLock() {
  epoch++;
  cached = null;
  lastGood = null;
  inflight = null;
}

/** The lock in force now, or null when the site is open. */
export async function gateLock(): Promise<GateLock | null> {
  const password = gatePassword();
  if (!password) return null;
  const s = await lockState();
  return s.on ? { password, gen: s.gen } : null;
}

/** True when this cookie lets the visitor through (always true while the site is open). */
export async function hasGatePass(cookie: string | undefined, lock?: GateLock | null) {
  const l = lock === undefined ? await gateLock() : lock;
  if (!l) return true;
  if (!cookie || l.gen === UNREADABLE) return false;
  const want = Buffer.from(gateToken(l.password, l.gen));
  const got = Buffer.from(cookie);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** How long a session check is trusted, how long one may take, and how many are remembered at once. */
export const SESSION_CACHE_MS = 5_000;
export const SESSION_READ_TIMEOUT_MS = 1_500;
const SESSION_CACHE_MAX = 2_000;
/** Session tokens are 32 random bytes in base64url; anything else is not looked up at all. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const sessionCache = new Map<string, { live: boolean; at: number }>();
const sessionInflight = new Map<string, Promise<boolean>>();
let sessionReads = 0;
/** How many session checks reached the database (tests check they are shared and remembered). */
export const sessionLookups = () => sessionReads;

/**
 * True when this browser holds a live web session: the same rule as signing in on every page (`currentUser`): not
 * expired, used within WEB_IDLE_MS, the account not suspended. Signing out, "sign out everywhere" and a password change
 * delete the session row, so they count within SESSION_CACHE_MS. A failed or slow check is false (fail closed).
 */
async function hasLiveSession(token: string | undefined): Promise<boolean> {
  if (!token || !TOKEN_SHAPE.test(token)) return false;
  const hash = hashToken(token);
  const hit = sessionCache.get(hash);
  if (hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit.live;
  const running = sessionInflight.get(hash);
  if (running) return running;
  const check = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      sessionReads++;
      const t = Date.now();
      const row = await Promise.race([
        q.get<{ one: number }>(
          `SELECT 1 AS one FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.kind = 'web' AND s.expires_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ? AND u.suspended_at IS NULL`,
          hash,
          t,
          t - WEB_IDLE_MS,
        ),
        new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("session read timed out")), SESSION_READ_TIMEOUT_MS))),
      ]);
      const live = !!row;
      if (sessionCache.size >= SESSION_CACHE_MAX) sessionCache.clear();
      sessionCache.set(hash, { live, at: Date.now() });
      return live;
    } catch (e) {
      console.error("[site-gate] couldn't check a session, treating it as signed out", e);
      return false;
    } finally {
      clearTimeout(timer);
      sessionInflight.delete(hash);
    }
  })();
  sessionInflight.set(hash, check);
  return check;
}

/** Forgets every remembered session check (tests; a re-lock doesn't need it, a session is a session). */
export function forgetSessionChecks() {
  sessionCache.clear();
  sessionInflight.clear();
}

/**
 * Whether the gate lets this request through (the proxy asks this). Open site: yes. Locked: a pass for the current
 * lock, or a live session, so signed-in people keep working when the site re-locks (owner, 14 Nov) and only signed-out
 * visitors see Coming soon. Switch unreadable (and no recent good read): no one, signed in or not.
 */
export async function gateAdmits(gateCookie: string | undefined, sessionToken: string | undefined) {
  const lock = await gateLock();
  if (!lock) return true;
  if (lock.gen === UNREADABLE) return false;
  if (await hasGatePass(gateCookie, lock)) return true;
  return hasLiveSession(sessionToken);
}

/** The pass for this lock, or null when the lock couldn't be read (no pass is good then). */
export const passFor = (l: GateLock) => (l.gen === UNREADABLE ? null : gateToken(l.password, l.gen));

/** The pass to set for this browser, or null while the site is open (or the lock can't be read). */
export async function gatePass(): Promise<string | null> {
  const l = await gateLock();
  return l ? passFor(l) : null;
}
