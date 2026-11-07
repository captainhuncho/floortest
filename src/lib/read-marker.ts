import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The proxy's mark that a request only reads (Safety audit M1, round 2). On GET and HEAD the proxy sets READ_HEADER to an
 * HMAC of a fixed label with APP_SECRET, after deleting any copy a client sent. auth.ts treats every request without a
 * matching mark as one that can change something, so a path the proxy never runs on (or a forged header) can't pass
 * for a read. No server-only import: the proxy uses it too.
 */
export const READ_HEADER = "x-ft-read";
const LABEL = "floortest:proxy-read:v1";

export function readMarker(secret = process.env.APP_SECRET ?? "") {
  return secret ? createHmac("sha256", secret).update(LABEL).digest("base64url") : "";
}

export function isReadMarker(value: string | null | undefined, secret = process.env.APP_SECRET ?? "") {
  const want = readMarker(secret);
  if (!value || !want) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a request can change something, from its headers: yes unless it carries the proxy's read mark; a Next-Action
 * header always counts as a change. auth.ts uses this for "view as" (read-only) and the lost-team-desk guard.
 */
export function isWriteRequest(h: Pick<Headers, "get">, secret = process.env.APP_SECRET ?? "") {
  return !isReadMarker(h.get(READ_HEADER), secret) || !!h.get("next-action");
}
