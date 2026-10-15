import crypto from "node:crypto";

/**
 * Password hashing (scrypt). Stored as `scrypt$<log2 N>$<r>$<p>$<salt hex>$<hash hex>`, so the cost can rise again later
 * without breaking older hashes.
 *
 * Cost: N=2^15, r=8, p=3 (32 MiB, a few hundred ms), one of OWASP's equivalent minimums for scrypt. Hashes made before
 * 15 Oct 2026 are `<salt hex>:<hash hex>` at Node's default (N=2^14, r=8, p=1), about an eighth of that; they still
 * verify, and `needsRehash` tells sign-in to replace them with the current cost once the password is proven.
 * Async, so a slow hash never blocks other requests on the same server.
 */
const CURRENT = { log2N: 15, r: 8, p: 3 };
const LEGACY = { log2N: 14, r: 8, p: 1 };
const KEY_LEN = 64;

type Cost = { log2N: number; r: number; p: number };

function derive(pw: string, salt: Buffer, c: Cost): Promise<Buffer> {
  const N = 2 ** c.log2N;
  // scrypt needs 128 * N * r * p bytes; give it room (Node's default cap is 32 MiB).
  const maxmem = 256 * N * c.r * Math.max(1, c.p);
  return new Promise((resolve, reject) =>
    crypto.scrypt(pw, salt, KEY_LEN, { N, r: c.r, p: c.p, maxmem }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

function parse(stored: string): { cost: Cost; salt: Buffer; hash: Buffer } | null {
  if (stored.startsWith("scrypt$")) {
    const [, n, r, p, salt, hash] = stored.split("$");
    const cost = { log2N: Number(n), r: Number(r), p: Number(p) };
    // Bounds keep a damaged or hostile row from asking for an absurd amount of memory or time.
    if (![cost.log2N, cost.r, cost.p].every(Number.isInteger) || cost.log2N < 10 || cost.log2N > 20 || cost.r < 1 || cost.r > 32 || cost.p < 1 || cost.p > 16) return null;
    if (!salt || !hash) return null;
    return { cost, salt: Buffer.from(salt, "hex"), hash: Buffer.from(hash, "hex") };
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return null;
  return { cost: LEGACY, salt: Buffer.from(salt, "hex"), hash: Buffer.from(hash, "hex") };
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await derive(pw, salt, CURRENT);
  return `scrypt$${CURRENT.log2N}$${CURRENT.r}$${CURRENT.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const s = parse(stored);
  if (!s || s.hash.length !== KEY_LEN) return false;
  const key = await derive(pw, s.salt, s.cost);
  return crypto.timingSafeEqual(key, s.hash);
}

/** True when a hash was made at a lower cost than today's (or in the old format): replace it after a successful sign-in. */
export function needsRehash(stored: string): boolean {
  const s = parse(stored);
  if (!s) return false;
  return s.cost.log2N < CURRENT.log2N || s.cost.r < CURRENT.r || s.cost.p < CURRENT.p || !stored.startsWith("scrypt$");
}
