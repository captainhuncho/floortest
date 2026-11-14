import crypto from "node:crypto";
import { q } from "./db";
import { env } from "./env";

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

/** The pass for this lock, or null when the lock couldn't be read (no pass is good then). */
export const passFor = (l: GateLock) => (l.gen === UNREADABLE ? null : gateToken(l.password, l.gen));

/** The pass to set for this browser, or null while the site is open (or the lock can't be read). */
export async function gatePass(): Promise<string | null> {
  const l = await gateLock();
  return l ? passFor(l) : null;
}
