import "server-only";
import crypto from "node:crypto";
import { q } from "@/lib/db";

/**
 * Actions that must happen once even when the request comes twice (a double tap, a retried form, a lost response):
 * the caller names the action and what makes it the same action, and only the first call within `windowMs` gets true.
 * The claim is a row in `request_claims` (migration 0098), written before the action runs; a later identical call
 * inside the window gets false and does nothing. Old claims are purged nightly (src/lib/retention.ts).
 * The parts are hashed, so message text never sits in the table.
 */
export async function claimOnce(scope: string, parts: unknown[], windowMs: number, at = Date.now()): Promise<boolean> {
  const key = crypto.createHash("sha256").update(JSON.stringify(parts)).digest("base64url");
  const row = await q.get(
    `INSERT INTO request_claims (scope, key, created_at) VALUES (?, ?, ?)
     ON CONFLICT (scope, key) DO UPDATE SET created_at = excluded.created_at WHERE request_claims.created_at < ?
     RETURNING 1 AS claimed`,
    scope,
    key,
    at,
    at - windowMs,
  );
  return !!row;
}

/** How long claims are kept; longer than any window a caller uses. */
export const CLAIM_KEEP_MS = 24 * 60 * 60 * 1000;
