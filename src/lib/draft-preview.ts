import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Previewing (and editing) site content from ops. Ops lives on its own host, so a draft preview can't ride on the ops
 * cookie: ops hands out a short-lived signed pass for floortest.app, which turns on draft mode there and leaves a
 * signed "who is previewing" cookie. Both are bound to the exact ops session that asked (its token hash), so signing
 * out of ops, or that session timing out, ends the preview at once, and a copied cookie is useless on its own.
 */
export const PREVIEW_COOKIE = "ft_preview";
const PASS_MS = 60_000;
/** Matches the ops idle timeout. */
export const PREVIEW_MS = 60 * 60_000;

export type Previewer = { adminId: number; session: string };

const sign = (kind: string, adminId: number, session: string, exp: number) =>
  crypto.createHmac("sha256", env.secret).update(`draft-preview:${kind}:${adminId}:${session}:${exp}`).digest("base64url").slice(0, 32);

const make = (kind: string, p: Previewer, ms: number) => {
  const exp = Date.now() + ms;
  return `${p.adminId}.${p.session}.${exp}.${sign(kind, p.adminId, p.session, exp)}`;
};

/** Who signed `token` for `kind`, and from which ops session, if it's genuine and unexpired. */
function check(kind: string, token: string | undefined | null): Previewer | null {
  const [id, session, exp, sig] = String(token ?? "").split(".");
  const adminId = Number(id);
  const until = Number(exp);
  if (!adminId || !/^[a-f0-9]{64}$/.test(session ?? "") || !until || until < Date.now() || !sig) return null;
  const want = Buffer.from(sign(kind, adminId, session, until));
  const got = Buffer.from(sig);
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? { adminId, session } : null;
}

/** A 60-second pass from ops to floortest.app. */
export const previewPass = (p: Previewer) => make("pass", p, PASS_MS);
export const passHolder = (token: string | null) => check("pass", token);

/**
 * Opens the preview with a pass, once. A genuine pass is recorded as spent (by the hash of its signature, kept until it
 * would have expired), so a copied or replayed link is refused, like a view-as ticket.
 */
export async function redeemPass(token: string | null) {
  const holder = passHolder(token);
  if (!holder) return null;
  const { q } = await import("./db");
  const [, , exp, sig] = String(token).split(".");
  const used = crypto.createHash("sha256").update(sig).digest("hex");
  await q.run("DELETE FROM preview_passes_used WHERE expires_at < ?", Date.now());
  const r = await q.run("INSERT INTO preview_passes_used (sig_hash, expires_at) VALUES (?, ?) ON CONFLICT (sig_hash) DO NOTHING", used, Number(exp));
  return r.changes ? holder : null;
}

/** The cookie floortest.app keeps while someone previews drafts. */
export const previewCookie = (p: Previewer) => make("cookie", p, PREVIEW_MS);
export const previewer = (token: string | undefined) => check("cookie", token);
