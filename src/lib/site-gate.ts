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

/** How long the proxy trusts a read of the switch, and how long one read may take before the site stays locked. */
export const LOCK_CACHE_MS = 5_000;
export const LOCK_READ_TIMEOUT_MS = 1_500;
/** A generation no pass is ever made for: used when the switch can't be read, so the site stays locked for everyone. */
const UNREADABLE = "unreadable";

let cached: { read: LockRead; at: number } | null = null;

async function readSwitch(): Promise<LockRead> {
  const row = await q.get<{ on: number; updated_at: number | string }>("SELECT on_ AS on, updated_at FROM switches WHERE key = ?", "site_lock");
  // No row: never flipped, so it is at its initial state (on) with the first generation.
  return row ? { on: !!Number(row.on), gen: String(row.updated_at) } : { on: true, gen: "" };
}

async function lockState(): Promise<LockRead> {
  if (cached && Date.now() - cached.at < LOCK_CACHE_MS) return cached.read;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = await Promise.race([
      readSwitch(),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("site_lock read timed out")), LOCK_READ_TIMEOUT_MS))),
    ]);
    cached = { read, at: Date.now() };
    return read;
  } catch (e) {
    console.error("[site-gate] couldn't read site_lock, keeping the site locked", e);
    return { on: true, gen: UNREADABLE };
  } finally {
    clearTimeout(timer);
  }
}

/** Forgets the cached read, so this process sees a flip at once (the admin action calls it; tests too). */
export function forgetGateLock() {
  cached = null;
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
