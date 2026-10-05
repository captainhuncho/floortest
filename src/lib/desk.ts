/** A receiver's desk: capacity, collections, link status, ownership checks and referrals. */
import "server-only";
import { emailText } from "./email-copy";
import crypto from "node:crypto";
import { now, q, USER_COLUMNS, type Collection, type Queryable, type Sender, type Track, type User } from "./db";
import { APP_URL, sendMail } from "./mail";
import { planOf } from "./plan-store";

export async function activeCount(userId: number, db: Queryable = q) {
  return (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL", userId))!.n;
}

/** Plan limit plus track slots earned through referrals. */
export async function capacity(user: Pick<User, "id" | "plan">, db: Queryable = q) {
  const used = await activeCount(user.id, db);
  const bonus = (await db.get<{ b: number }>("SELECT bonus_songs AS b FROM users WHERE id = ?", user.id))?.b ?? 0;
  const limit = (await planOf(user.plan)).limit + bonus;
  return { used, limit, bonus, full: used >= limit };
}

export const REFERRAL_BONUS = 10;

/** Most extra slots referrals can ever add to one account. */
export const REFERRAL_BONUS_CAP = 100;

/**
 * A referral pays out once the invited receiver gets their first track, so only real, active desks earn slots.
 * Both sides get the bonus, once, up to REFERRAL_BONUS_CAP each. It doesn't count when the invited account's email
 * isn't confirmed, or when the first track came from either account itself (that's how slots get farmed).
 */
export async function rewardReferral(receiverId: number, senderEmail: string) {
  const from = senderEmail.trim().toLowerCase();
  const u = await q.tx(async (db) => {
    const r = await db.get<{ id: number; name: string; referred_by: number | null }>(
      `UPDATE users u SET referral_rewarded_at = ? WHERE u.id = ? AND u.referred_by IS NOT NULL AND u.referral_rewarded_at IS NULL
         AND u.email_verified_at IS NOT NULL AND lower(u.email) <> ?
         AND NOT EXISTS (SELECT 1 FROM users r WHERE r.id = u.referred_by AND lower(r.email) = ?)
       RETURNING u.id, u.name, u.referred_by`,
      now(),
      receiverId,
      from,
      from,
    );
    if (r?.referred_by)
      await db.run("UPDATE users SET bonus_songs = LEAST(bonus_songs + ?, ?) WHERE id IN (?, ?)", REFERRAL_BONUS, REFERRAL_BONUS_CAP, r.id, r.referred_by);
    return r;
  });
  if (!u?.referred_by) return;
  const referrer = await q.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", u.referred_by);
  if (referrer)
    await sendMail({
      userId: referrer.id,
      audience: "receiver",
      to: referrer.email,
      ...(await emailText("referral", { friend: u.name, bonus: REFERRAL_BONUS, referrals_url: `${APP_URL}/dashboard/referrals` })),
    });
}

export type CollectionSummary = Collection & { count: number; needs_review: number; kept: number };

export async function collectionsFor(userId: number) {
  return q.all<CollectionSummary>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL) AS count,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.decision IS NULL) AS needs_review,
            (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL AND t.decision = 'kept') AS kept
     FROM collections c WHERE c.user_id = ? ORDER BY c.created_at`,
    userId,
  );
}

export async function userByHandle(handle: string) {
  return q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE handle = ? AND suspended_at IS NULL`, handle.toLowerCase());
}

export async function activeCollection(user: Pick<User, "active_collection_id">, db: Queryable = q) {
  return user.active_collection_id ? db.get<Collection>("SELECT * FROM collections WHERE id = ?", user.active_collection_id) : undefined;
}

export const isClosed = (c: Collection | undefined, at = now()) => !!c?.closes_at && c.closes_at <= at;

/** "Pause my link": the receiver is away. Ends on its own at pause_until, if one was set. */
export const isPaused = (u: Pick<User, "paused_at" | "pause_until">, at = now()) => !!u.paused_at && (!u.pause_until || u.pause_until > at);

export function pausedMessage(u: Pick<User, "name" | "pause_until" | "tz">) {
  const until = u.pause_until ? ` until ${new Date(u.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: u.tz })}` : "";
  return `${u.name} is taking a break from submissions${until}.`;
}

export async function ownedTrack(userId: number, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  return q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, userId);
}

export async function ownedSender(userId: number, senderId: number) {
  if (!Number.isSafeInteger(senderId)) return undefined;
  return q.get<Sender>("SELECT * FROM senders WHERE id = ? AND user_id = ?", senderId, userId);
}

/* ───────────────────────── Intake ───────────────────────── */

/** A short, unambiguous invite code, created the first time someone opens Referrals. */
export async function referralCodeFor(userId: number) {
  const existing = (await q.get<{ c: string | null }>("SELECT referral_code AS c FROM users WHERE id = ?", userId))?.c;
  if (existing) return existing;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from(crypto.randomBytes(7), (b) => alphabet[b % alphabet.length]).join("");
    const r = await q.run(
      "UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = ?)",
      code,
      userId,
      code,
    );
    if (r.changes) return code;
    const current = (await q.get<{ c: string | null }>("SELECT referral_code AS c FROM users WHERE id = ?", userId))?.c;
    if (current) return current; // set concurrently
  }
  throw new Error("Could not allocate a referral code");
}
