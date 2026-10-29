import crypto from "node:crypto";
import { normalEmail } from "./email-normal";

/**
 * "Continue with Google". Google confirms who someone is; we decide what that's worth:
 * - Only Gmail addresses and company Google Workspace accounts count (Google's own guidance): for any other address a
 *   Google account proves little about who owns the inbox.
 * - The first Google sign-in pins that Google account (its permanent `sub` id) to the FloorTest account; a different
 *   Google account with the same email is refused later. Pinning an existing account needs its password (or happens
 *   from Settings while signed in), and the owner is emailed.
 * - Two-factor still applies, and an unconfirmed account is never claimed.
 *
 * The hand-off uses a random `state` and a PKCE verifier in a short-lived, signed, HttpOnly cookie, matched exactly on
 * the way back and used once. The ID token comes straight from Google's token endpoint over TLS; its audience, issuer,
 * expiry and email_verified are still checked.
 */
export const GOOGLE_COOKIE = "ft_google";
export const GOOGLE_SIGNUP_COOKIE = "ft_google_signup";
export const GOOGLE_LINK_COOKIE = "ft_google_link";
export const FLOW_MS = 10 * 60_000;
export const SIGNUP_MS = 30 * 60_000;
export const LINK_MS = 10 * 60_000;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GMAIL = /@(gmail|googlemail)\.com$/;

export type GoogleIdentity = { email: string; sub: string; first: string; last: string };

export const googleConfig = () => {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
};

const b64 = (b: Buffer) => b.toString("base64url");
const mac = (secret: string, kind: string, body: string) => b64(crypto.createHmac("sha256", secret).update(`google-${kind}:${body}`).digest());
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** A signed, expiring value for a cookie; `kind` keeps one kind of cookie from passing as another. */
function seal(kind: string, value: object, ms: number, secret: string, at: number) {
  const body = b64(Buffer.from(JSON.stringify({ ...value, exp: at + ms })));
  return `${body}.${mac(secret, kind, body)}`;
}

function unseal<T>(kind: string, cookie: string | undefined, secret: string, at: number): T | null {
  const [body, sig] = String(cookie ?? "").split(".");
  if (!body || !sig || !same(sig, mac(secret, kind, body))) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    return v.exp && v.exp > at ? v : null;
  } catch {
    return null;
  }
}

/** A new flow: the cookie to set and the Google URL to send the browser to. `link` is set when connecting from Settings. */
export function startFlow(clientId: string, redirectUri: string, secret: string, at = Date.now(), link: number | null = null) {
  const state = b64(crypto.randomBytes(32));
  const verifier = b64(crypto.randomBytes(48));
  const challenge = b64(crypto.createHash("sha256").update(verifier).digest());
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { cookie: seal("flow", { state, verifier, link }, FLOW_MS, secret, at), url: url.toString() };
}

/** The verifier (and who is linking, if anyone) when `cookie` is genuine, unexpired and issued for exactly this `state`. */
export function checkFlow(cookie: string | undefined, state: string | null, secret: string, at = Date.now()) {
  const f = unseal<{ state?: string; verifier?: string; link?: number | null }>("flow", cookie, secret, at);
  if (!f?.state || !f.verifier || !state || !same(f.state, state)) return null;
  return { verifier: f.verifier, link: typeof f.link === "number" ? f.link : null };
}

/**
 * Who an ID token says signed in, or why it doesn't count: "bad" (anything about the token is off) or "untrusted"
 * (an address that isn't Gmail or a company Google Workspace account).
 */
export function identityFromClaims(c: Record<string, unknown>, clientId: string, at = Date.now()): GoogleIdentity | "bad" | "untrusted" {
  if (c.aud !== clientId || !ISSUERS.includes(String(c.iss)) || !(Number(c.exp) * 1000 > at)) return "bad";
  if (c.email_verified !== true && c.email_verified !== "true") return "bad";
  const email = normalEmail(String(c.email ?? ""));
  const sub = String(c.sub ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{5,64}$/.test(sub)) return "bad";
  const hd = String(c.hd ?? "").toLowerCase();
  if (!GMAIL.test(email) && !(hd && email.endsWith(`@${hd}`))) return "untrusted";
  const name = (k: string) => String(c[k] ?? "").trim().slice(0, 60);
  return { email, sub, first: name("given_name"), last: name("family_name") };
}

/** Swaps the one-time code (with the PKCE verifier) for who signed in. */
export async function identityFromCode(cfg: { id: string; secret: string }, code: string, verifier: string, redirectUri: string): Promise<GoogleIdentity | "bad" | "untrusted"> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return "bad";
  const payload = String(((await res.json().catch(() => ({}))) as { id_token?: string }).id_token ?? "").split(".")[1];
  if (!payload) return "bad";
  try {
    return identityFromClaims(JSON.parse(Buffer.from(payload, "base64url").toString()), cfg.id);
  } catch {
    return "bad";
  }
}

/** Who Google confirmed, held for the sign-up form when no account matches. */
export const signIdentity = (id: GoogleIdentity, secret: string, at = Date.now()) => seal("signup", id, SIGNUP_MS, secret, at);
export function readIdentity(cookie: string | undefined, secret: string, at = Date.now()): GoogleIdentity | null {
  const v = unseal<GoogleIdentity>("signup", cookie, secret, at);
  return v?.email && v.sub ? { email: v.email, sub: v.sub, first: v.first ?? "", last: v.last ?? "" } : null;
}

/** A Google account waiting for the owner's password before it's pinned to their existing account. */
export type PendingLink = { userId: number; sub: string; email: string };
export const signPendingLink = (p: PendingLink, secret: string, at = Date.now()) => seal("link", p, LINK_MS, secret, at);
export function readPendingLink(cookie: string | undefined, secret: string, at = Date.now()): PendingLink | null {
  const v = unseal<PendingLink>("link", cookie, secret, at);
  return v && Number.isInteger(v.userId) && v.sub ? { userId: v.userId, sub: v.sub, email: v.email } : null;
}
