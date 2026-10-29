import crypto from "node:crypto";

/**
 * Authenticator-app codes (RFC 6238: 30-second steps, 6 digits, HMAC-SHA1), which is what
 * Google Authenticator, 1Password, Authy and friends all speak. No server-side state beyond the
 * secret and the last step used, which stops a code being replayed.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_S = 30;

export function base32Encode(buf: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function totpCode(secret: string, step: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const currentStep = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_S);

/**
 * Checks a code against the current step and one either side (clock drift). Returns the step it
 * matched so the caller can store it and refuse the same or an older step next time.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null, ms = Date.now()): number | null {
  const c = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = currentStep(ms);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const want = totpCode(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c))) return step;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = "FloorTest") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_S}`;

/* Secrets at rest: AES-256-GCM with a key derived from APP_SECRET. */

const keyFrom = (appSecret: string) => crypto.createHash("sha256").update(`floortest-totp:${appSecret}`).digest();

export function sealSecret(plain: string, appSecret: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(appSecret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string, appSecret: string) {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(appSecret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

/* Recovery codes: shown once, stored only as keyed hashes, each usable once. */

export function newRecoveryCodes(n = 10) {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const s = Array.from(crypto.randomBytes(10), (b) => a[b % a.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

const cleanRecovery = (code: string) => code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** How a recovery code is stored: keyed with the app secret, so a copy of the database alone can't be brute-forced. */
export const hashRecovery = (code: string, appSecret: string) =>
  crypto.createHmac("sha256", appSecret).update(`recovery:${cleanRecovery(code)}`).digest("hex");

/** Codes issued before 29 Oct 2026 were stored as plain SHA-256. Still accepted (once each) until they're used or replaced. */
const legacyRecoveryHash = (code: string) => crypto.createHash("sha256").update(cleanRecovery(code)).digest("hex");

/** Which stored hash (new or old form) this typed recovery code matches, if any: the caller removes that one. */
export const matchRecovery = (stored: string[], code: string, appSecret: string) =>
  [hashRecovery(code, appSecret), legacyRecoveryHash(code)].find((h) => stored.includes(h)) ?? null;
