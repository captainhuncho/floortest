import "server-only";
import crypto from "node:crypto";
import { roleOn, teamsOn } from "@/lib/account-members";
import { now, q } from "@/lib/db";
import { env } from "@/lib/env";
import { fileAccess } from "@/lib/file-access";
import { WEB_IDLE_MS } from "@/lib/sessions";

/**
 * Offline kept tracks (phone apps): the app downloads each kept track through a short-lived signed link, because the
 * phone's downloader doesn't carry the browser's sign-in. A link names one track, the desk it's on, the person who
 * asked and the sign-in (session) they asked from, and lasts an hour. Every download checks all four again, so signing
 * out, ending that session on the Security page or leaving the team stops the link at once (Codex review, 19 Oct).
 */
export const OFFLINE_LINK_MS = 3_600_000;
/** Saved copies are wiped if the phone hasn't checked in with Prepare for this long (the apps enforce it). */
export const OFFLINE_MAX_DAYS = 30;
/** The storage link a download is sent on to: long enough to start the download, never past the offline link. */
export const STORAGE_LINK_SECONDS = 300;

export type OfflineGrant = { trackId: number; deskId: number; actorId: number; session: string; expiresAt: number };

const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`offline:${body}`).digest("base64url");

/** `session` is the stored hash of the sign-in that asked (never the sign-in token itself). */
export function offlineToken(trackId: number, deskId: number, actorId: number, session: string, at = Date.now()) {
  const body = `${trackId}.${deskId}.${actorId}.${session}.${at + OFFLINE_LINK_MS}`;
  return `${body}.${sign(body)}`;
}

export function readOfflineToken(token: string, at = Date.now()): OfflineGrant | null {
  const parts = token.split(".");
  if (parts.length !== 6) return null;
  const [t, d, a, session, exp, sig] = parts;
  const expected = sign(`${t}.${d}.${a}.${session}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const expiresAt = Number(exp);
  if (!(expiresAt > at)) return null;
  const [trackId, deskId, actorId] = [Number(t), Number(d), Number(a)];
  if (![trackId, deskId, actorId].every(Number.isSafeInteger) || !/^[a-f0-9]{64}$/.test(session)) return null;
  return { trackId, deskId, actorId, session, expiresAt };
}

/**
 * The file an offline link may fetch right now, or null. Checked on every download: the link itself, the sign-in it
 * was made from (still live, still this person's, not suspended), the person's place on the desk (a teammate who has
 * left or lost their seat gets nothing), and the track (still on that desk, kept, in Prepare, not deleted).
 */
export async function offlineFile(token: string, at = now()): Promise<{ fileKey: string; mime: string; expiresIn: number } | null> {
  const g = readOfflineToken(token, at);
  if (!g) return null;
  const live = await q.get<{ kind: string }>(
    `SELECT s.kind FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.user_id = ? AND s.expires_at > ? AND u.suspended_at IS NULL
       AND (s.kind <> 'web' OR COALESCE(s.last_seen_at, s.created_at) > ?)`,
    g.session,
    g.actorId,
    at,
    at - WEB_IDLE_MS,
  );
  if (!live) return null;
  if (g.deskId !== g.actorId && !((await teamsOn(g.deskId)) && (await roleOn(g.deskId, g.actorId)))) return null;
  const desk = await q.get<{ id: number; plan: string }>("SELECT id, plan FROM users WHERE id = ? AND suspended_at IS NULL", g.deskId);
  const f = await fileAccess(desk, "offline", g.trackId);
  if (!f) return null;
  const left = Math.floor((g.expiresAt - at) / 1000);
  return left > 0 ? { fileKey: f.key, mime: f.mime, expiresIn: Math.min(STORAGE_LINK_SECONDS, f.maxLinkSeconds, left) } : null;
}
