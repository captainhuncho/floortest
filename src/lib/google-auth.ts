import crypto from "node:crypto";

/**
 * "Continue with Google" for existing accounts. Google only confirms who someone is; it links only to an account whose
 * email is already confirmed, never creates one (sign-up stays invite-only) and never skips two-factor.
 *
 * Protections: a random `state` and a PKCE verifier, both kept in a short-lived HttpOnly cookie signed with the app
 * secret, matched exactly on the way back and used once. The ID token comes straight from Google's token endpoint over
 * TLS, and its audience, issuer, expiry and email_verified are still checked.
 */
export const GOOGLE_COOKIE = "ft_google";
export const FLOW_MS = 10 * 60_000;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const googleConfig = () => {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
};

const b64 = (b: Buffer) => b.toString("base64url");
const mac = (secret: string, body: string) => b64(crypto.createHmac("sha256", secret).update(`google-flow:${body}`).digest());

/** A new flow: the cookie to set and the Google URL to send the browser to. */
export function startFlow(clientId: string, redirectUri: string, secret: string, at = Date.now()) {
  const state = b64(crypto.randomBytes(32));
  const verifier = b64(crypto.randomBytes(48));
  const challenge = b64(crypto.createHash("sha256").update(verifier).digest());
  const body = b64(Buffer.from(JSON.stringify({ state, verifier, exp: at + FLOW_MS })));
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
  return { cookie: `${body}.${mac(secret, body)}`, url: url.toString() };
}

/** The verifier, if `cookie` is genuine, unexpired and was issued for exactly this `state`. */
export function checkFlow(cookie: string | undefined, state: string | null, secret: string, at = Date.now()): string | null {
  const [body, sig] = String(cookie ?? "").split(".");
  if (!body || !sig || !state) return null;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let flow: { state?: string; verifier?: string; exp?: number };
  try {
    flow = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (!flow.state || !flow.verifier || !flow.exp || flow.exp < at) return null;
  const a = Buffer.from(flow.state);
  const b = Buffer.from(state);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? flow.verifier : null;
}

/** The confirmed email in an ID token's claims, or null if anything about the token is off. */
export function emailFromClaims(c: Record<string, unknown>, clientId: string, at = Date.now()): string | null {
  if (c.aud !== clientId || !ISSUERS.includes(String(c.iss)) || !(Number(c.exp) * 1000 > at)) return null;
  if (c.email_verified !== true && c.email_verified !== "true") return null;
  const email = String(c.email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Swaps the one-time code (with the PKCE verifier) for who signed in: their confirmed email and name. */
export async function identityFromCode(cfg: { id: string; secret: string }, code: string, verifier: string, redirectUri: string): Promise<GoogleIdentity | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const idToken = String(((await res.json().catch(() => ({}))) as { id_token?: string }).id_token ?? "");
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    const email = emailFromClaims(claims, cfg.id);
    const name = (k: string) => String(claims[k] ?? "").trim().slice(0, 60);
    return email ? { email, first: name("given_name"), last: name("family_name") } : null;
  } catch {
    return null;
  }
}

/** Who Google confirmed, held for the sign-up form when no account matches. Signed, HttpOnly, 30 minutes. */
export const GOOGLE_SIGNUP_COOKIE = "ft_google_signup";
export const SIGNUP_MS = 30 * 60_000;
export type GoogleIdentity = { email: string; first: string; last: string };

export function signIdentity(id: GoogleIdentity, secret: string, at = Date.now()) {
  const body = b64(Buffer.from(JSON.stringify({ ...id, exp: at + SIGNUP_MS })));
  return `${body}.${mac(secret, `signup:${body}`)}`;
}

export function readIdentity(cookie: string | undefined, secret: string, at = Date.now()): GoogleIdentity | null {
  const [body, sig] = String(cookie ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(secret, `signup:${body}`));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString()) as GoogleIdentity & { exp: number };
    return v.exp > at && v.email ? { email: v.email, first: v.first ?? "", last: v.last ?? "" } : null;
  } catch {
    return null;
  }
}
