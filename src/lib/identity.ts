import "server-only";
import crypto from "node:crypto";
import { q } from "./db";

/** Letters only, so "Black-Coffee", "blackcoffee1" and "black_coffee" compare equal. */
export const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * True when a link name is, or clearly contains, a protected name (a well-known artist or label).
 * Short protected names only match exactly, so "dj" or "kay" don't block half the alphabet.
 */
export async function isProtectedHandle(handle: string) {
  const n = normalizeName(handle);
  if (!n) return false;
  const names = await q.all<{ handle: string }>("SELECT handle FROM protected_names");
  return names.some(({ handle: p }) => n === p || (p.length >= 5 && n.includes(p)));
}

export const newIdentityCode = () => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `FLOORTEST-${Array.from(crypto.randomBytes(4), (b) => a[b % a.length]).join("")}`;
};

/** Profile links a person can prove they control. Anything else is rejected. */
export const IDENTITY_HOSTS = [
  "instagram.com",
  "soundcloud.com",
  "ra.co",
  "residentadvisor.net",
  "open.spotify.com",
  "music.apple.com",
  "bandcamp.com",
  "mixcloud.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "beatport.com",
];

export function cleanProfileLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `https://${u.host}${u.pathname}`.replace(/\/$/, "").slice(0, 200);
  } catch {
    return null;
  }
}
