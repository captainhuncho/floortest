import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { now, q } from "./db";
import { env, isPreview, isProd } from "./env";
import { hashToken } from "./token-hash";
import { deviceLabel } from "./device-label";
import { pickRelyingParty, type RelyingParty } from "./passkey-rp";

/**
 * Passkeys for desk accounts (owner, 29 Oct): add one in Settings → Security, then sign in with it on /login (no
 * password, no code: the device already asked for a face, fingerprint or PIN, which is two factors in one), or use
 * it instead of the 6-digit code at the two-step step. Website only; the apps keep their own sign-in.
 *
 * Every ceremony gets a one-time challenge held in passkey_challenges for 5 minutes, keyed by the hash of a random id
 * in an httpOnly cookie, and deleted when used, so an answer can't be replayed. User verification is required every
 * time, and the browser's address must be one of ours (pickRelyingParty).
 */

export const MAX_PASSKEYS = 10;
const CHALLENGE_COOKIE = "floortest_passkey";
const CHALLENGE_MS = 5 * 60_000;
/** A real answer is a few kB; anything far larger is refused before it is parsed. */
const MAX_ANSWER = 16_000;

type Purpose = "add" | "signin" | "second";

export type PasskeyRow = { id: number; name: string; created_at: number; last_used_at: number | null; backed_up: boolean };

/** The relying party for the address this request came to, or null when it isn't one of ours. */
export async function relyingParty(): Promise<RelyingParty | null> {
  const h = await headers();
  const extra = isPreview ? [process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL] : [];
  return pickRelyingParty(h.get("x-forwarded-host") ?? h.get("host"), env.appUrl, extra);
}

async function saveChallenge(challenge: string, purpose: Purpose, userId: number | null) {
  const id = crypto.randomBytes(24).toString("base64url");
  await q.run("INSERT INTO passkey_challenges (id_hash, challenge, user_id, purpose, expires_at) VALUES (?,?,?,?,?)", hashToken(id), challenge, userId, purpose, now() + CHALLENGE_MS);
  (await cookies()).set(CHALLENGE_COOKIE, id, { httpOnly: true, sameSite: "strict", secure: isProd, path: "/", maxAge: CHALLENGE_MS / 1000 });
}

/** Uses up this browser's challenge for `purpose`: it works once, whatever the answer. */
async function takeChallenge(purpose: Purpose): Promise<{ challenge: string; user_id: number | null } | null> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id) return null;
  const row = await q.get<{ challenge: string; user_id: number | null }>(
    "DELETE FROM passkey_challenges WHERE id_hash = ? AND purpose = ? AND expires_at > ? RETURNING challenge, user_id",
    hashToken(id),
    purpose,
    now(),
  );
  return row ? { challenge: row.challenge, user_id: row.user_id == null ? null : Number(row.user_id) } : null;
}

const sized = (answer: unknown) => !!answer && typeof answer === "object" && JSON.stringify(answer).length <= MAX_ANSWER;

/** A stable, opaque handle for the person on their device: not their email or database id. */
const userHandle = (userId: number) => new Uint8Array(crypto.createHmac("sha256", env.secret).update(`passkey-user:${userId}`).digest().subarray(0, 16));

const transportsOf = (json: string): AuthenticatorTransport[] => {
  try {
    const t = JSON.parse(json);
    return Array.isArray(t) ? t.filter((x): x is AuthenticatorTransport => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export async function listPasskeys(userId: number): Promise<PasskeyRow[]> {
  return q.all<PasskeyRow>("SELECT id, name, created_at, last_used_at, backed_up FROM passkeys WHERE user_id = ? ORDER BY created_at", userId);
}

export async function hasPasskey(userId: number) {
  return !!(await q.get("SELECT 1 FROM passkeys WHERE user_id = ? LIMIT 1", userId));
}

/** Step 1 of adding one: what the browser needs to make a passkey for this account. */
export async function addOptions(user: { id: number; email: string; name: string }) {
  const rp = await relyingParty();
  if (!rp) return null;
  const mine = await q.all<{ credential_id: string; transports: string }>("SELECT credential_id, transports FROM passkeys WHERE user_id = ?", user.id);
  const options = await generateRegistrationOptions({
    rpName: "FloorTest",
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: userHandle(user.id),
    attestationType: "none",
    // A passkey already on this account isn't made twice on the same device or password manager.
    excludeCredentials: mine.map((c) => ({ id: c.credential_id, transports: transportsOf(c.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await saveChallenge(options.challenge, "add", user.id);
  return options;
}

/** Step 2: checks the browser's answer and keeps the passkey's public key. */
export async function addPasskey(userId: number, answer: unknown): Promise<{ ok: true; name: string } | { error: string }> {
  const rp = await relyingParty();
  const ch = await takeChallenge("add");
  if (!rp || !ch || ch.user_id !== userId) return { error: "That took too long. Try adding the passkey again." };
  if (!sized(answer)) return { error: "That passkey didn't work. Try again." };
  if ((await listPasskeys(userId)).length >= MAX_PASSKEYS) return { error: `You have ${MAX_PASSKEYS} passkeys, the most an account can have. Remove one first.` };
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: answer as RegistrationResponseJSON,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    return { error: "That passkey didn't work. Try again." };
  }
  if (!result.verified) return { error: "That passkey didn't work. Try again." };
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const name = deviceLabel((await headers()).get("user-agent") ?? "").slice(0, 60) || "Passkey";
  const saved = await q.run(
    `INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, name, created_at)
     VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (credential_id) DO NOTHING`,
    userId,
    credential.id,
    Buffer.from(credential.publicKey).toString("base64url"),
    credential.counter,
    JSON.stringify(credential.transports ?? []),
    credentialDeviceType,
    credentialBackedUp,
    name,
    now(),
  );
  if (!saved.changes) return { error: "That passkey is already on an account." };
  return { ok: true, name };
}

/** Sign-in with a passkey: the browser offers whichever FloorTest passkeys the person has. */
export async function signInOptions() {
  const rp = await relyingParty();
  if (!rp) return null;
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" });
  await saveChallenge(options.challenge, "signin", null);
  return options;
}

/** Two-step with a passkey: only this account's passkeys are offered. Null when it has none. */
export async function secondStepOptions(userId: number) {
  const rp = await relyingParty();
  const mine = await q.all<{ credential_id: string; transports: string }>("SELECT credential_id, transports FROM passkeys WHERE user_id = ?", userId);
  if (!rp || !mine.length) return null;
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: mine.map((c) => ({ id: c.credential_id, transports: transportsOf(c.transports) })),
  });
  await saveChallenge(options.challenge, "second", userId);
  return options;
}

/**
 * Checks a passkey answer against this browser's challenge. Returns the account it belongs to, or null. For the
 * two-step step the passkey must also belong to `expectUser`.
 */
export async function checkPasskey(purpose: "signin" | "second", answer: unknown, expectUser: number | null = null): Promise<number | null> {
  const rp = await relyingParty();
  const ch = await takeChallenge(purpose);
  if (!rp || !ch || ch.user_id !== expectUser || !sized(answer)) return null;
  const response = answer as AuthenticationResponseJSON;
  if (typeof response.id !== "string" || response.id.length > 1024) return null;
  const row = await q.get<{ id: number; user_id: number; public_key: string; counter: number; transports: string }>(
    "SELECT id, user_id, public_key, counter, transports FROM passkeys WHERE credential_id = ?",
    response.id,
  );
  if (!row || (expectUser !== null && Number(row.user_id) !== expectUser)) return null;
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: { id: response.id, publicKey: new Uint8Array(Buffer.from(row.public_key, "base64url")), counter: Number(row.counter), transports: transportsOf(row.transports) },
    });
  } catch {
    return null;
  }
  if (!result.verified) return null;
  // The library has already refused a counter that went backwards (a cloned key); keep the new one.
  await q.run(
    "UPDATE passkeys SET counter = ?, backed_up = ?, last_used_at = ? WHERE id = ?",
    result.authenticationInfo.newCounter,
    result.authenticationInfo.credentialBackedUp,
    now(),
    row.id,
  );
  return Number(row.user_id);
}

/** Removes one of this account's passkeys. The device keeps its copy, but it no longer opens this account. */
export async function removePasskey(userId: number, id: number): Promise<string | null> {
  const r = await q.get<{ name: string }>("DELETE FROM passkeys WHERE id = ? AND user_id = ? RETURNING name", id, userId);
  return r?.name ?? null;
}
