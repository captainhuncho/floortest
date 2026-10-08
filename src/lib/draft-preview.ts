import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Previewing site-content drafts from ops. Ops lives on its own host, so a draft preview can't ride on the ops cookie:
 * ops hands out a short-lived signed pass for floortest.app, which turns on draft mode there and leaves a signed
 * "who is previewing" cookie. Drafts only show while that person's ops session is live (see content.ts).
 */
export const PREVIEW_COOKIE = "ft_preview";
const PASS_MS = 60_000;
export const PREVIEW_MS = 2 * 60 * 60_000;

const sign = (kind: string, adminId: number, exp: number) =>
  crypto.createHmac("sha256", env.secret).update(`draft-preview:${kind}:${adminId}:${exp}`).digest("base64url").slice(0, 32);

const make = (kind: string, adminId: number, ms: number) => {
  const exp = Date.now() + ms;
  return `${adminId}.${exp}.${sign(kind, adminId, exp)}`;
};

/** Who signed `token` for `kind`, if it's genuine and unexpired. */
function check(kind: string, token: string | undefined | null): number | null {
  const [id, exp, sig] = String(token ?? "").split(".");
  const adminId = Number(id);
  const until = Number(exp);
  if (!adminId || !until || until < Date.now() || !sig) return null;
  const want = Buffer.from(sign(kind, adminId, until));
  const got = Buffer.from(sig);
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? adminId : null;
}

/** A 60-second pass from ops to floortest.app. */
export const previewPass = (adminId: number) => make("pass", adminId, PASS_MS);
export const passHolder = (token: string | null) => check("pass", token);

/** The cookie floortest.app keeps while someone previews drafts. */
export const previewCookie = (adminId: number) => make("cookie", adminId, PREVIEW_MS);
export const previewer = (token: string | undefined) => check("cookie", token);
