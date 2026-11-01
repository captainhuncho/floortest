import "server-only";
import { likeContains, q } from "./db";
import { env } from "./env";
import { emailText, VERIFIED_HOW } from "./email-copy";

/** The "verified" email (Admin → Site content → Emails), with the line for how the mark was added. */
export const verifiedEmail = (u: { name: string; handle: string }, how: keyof typeof VERIFIED_HOW) =>
  emailText("verified", { first_name: u.name.split(/\s+/)[0], link: `${env.appUrl}/${u.handle}`, how_line: VERIFIED_HOW[how] });

/**
 * Verifying someone without a request (owner, 1 Nov) now needs a reason and proof, and the permission
 * "verification.direct": src/lib/verification-proposals.ts verifyDirect. This file keeps the email and the search.
 */
export const DIRECT_SEARCH_MAX = 10;

export type DirectMatch = { id: number; name: string; handle: string; email: string; identity_status: string; suspended_at: number | null; email_verified_at: number | null };

/** Verification → "Verify someone directly": accounts whose handle or email contains the search, at most 10. */
export async function findToVerify(raw: string): Promise<DirectMatch[]> {
  const term = raw.trim().replace(/^@/, "").slice(0, 100);
  if (term.length < 2) return [];
  const like = likeContains(term);
  return q.all<DirectMatch>(
    `SELECT id, name, handle, email, identity_status, suspended_at, email_verified_at FROM users
     WHERE handle ILIKE ? OR email ILIKE ?
     ORDER BY (lower(handle) = lower(?)) DESC, created_at DESC LIMIT ${DIRECT_SEARCH_MAX}`,
    like,
    like,
    term,
  );
}
