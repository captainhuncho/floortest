/** A receiver's desk: capacity, collections, link status, ownership checks and referrals. */
import "server-only";
import { emailText } from "./email-copy";
import crypto from "node:crypto";
import { asPerson, now, q, USER_COLUMNS, type Collection, type Queryable, type Sender, type Track, type User } from "./db";
import { APP_URL, sendMail } from "./mail";
import { planLimit } from "./plan-store";
import { switchOn } from "./switches";
import { cache } from "react";

export async function activeCount(userId: number, db: Queryable = q) {
  return (await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL", userId))!.n;
}

/** Plan limit plus track slots earned through referrals. */
export async function capacity(user: Pick<User, "id" | "plan">, db: Queryable = q) {
  const used = await activeCount(user.id, db);
  const bonus = (await db.get<{ b: number }>("SELECT bonus_songs AS b FROM users WHERE id = ?", user.id))?.b ?? 0;
  const limit = (await planLimit(user.plan, db)) + bonus;
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
  const referrer = await q.get<{ id: number; email: string; name: string; first_name: string | null }>("SELECT id, email, name, first_name FROM users WHERE id = ?", u.referred_by);
  if (referrer)
    await sendMail({
      userId: referrer.id,
      audience: "receiver",
      to: referrer.email,
      ...(await emailText("referral", { first_name: referrer.first_name?.trim() || referrer.name.split(/\s+/)[0], friend: u.name, bonus: REFERRAL_BONUS, referrals_url: `${APP_URL}/dashboard/referrals` })),
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

export const isClosed = (c: Collection | undefined, at = now()) => (!!c?.closes_at && c.closes_at <= at) || !!c?.full_at;
/** Closed because it reached its track cap (rather than its closing date). */
export const isFull = (c: Collection | undefined) => !!c?.full_at;
/** After tracks are deleted: a full callout whose live tracks have dropped back under its cap takes sends again. */
export async function reopenCallouts(db: Queryable = q) {
  await db.run(
    `UPDATE collections c SET full_at = NULL WHERE c.full_at IS NOT NULL
       AND c.max_tracks > (SELECT COUNT(*) FROM tracks t WHERE t.collection_id = c.id AND t.deleted_at IS NULL)`,
  );
}
/** Whether this account's plan can cap callouts (Pro and Team). */
export const canCapCallouts = (plan: string) => plan !== "free";

/** Collections a desk can hold during the beta (owner, 15 Oct); the "more_collections" switch lifts it. */
export const BETA_COLLECTIONS = 2;

/** Whether this desk may start another collection: always with "more_collections" on, otherwise under two. */
export async function canAddCollection(deskId: number, db: Queryable = q) {
  if (await switchOn("more_collections")) return true;
  const n = await db.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM collections WHERE user_id = ?", deskId);
  return Number(n?.n ?? 0) < BETA_COLLECTIONS;
}

/** "Pause my link": the receiver is away. Ends on its own at pause_until, if one was set. */
export const isPaused = (u: Pick<User, "paused_at" | "pause_until">, at = now()) => !!u.paused_at && (!u.pause_until || u.pause_until > at);

export function pausedMessage(u: Pick<User, "name" | "pause_until" | "tz">) {
  const until = u.pause_until ? ` until ${new Date(u.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: u.tz })}` : "";
  return `${u.name} is taking a break from submissions${until}.`;
}

/** The desk being worked (`id`) and the signed-in person working it (`actor_id`), as `currentUser()` returns them. */
type DeskActor = Pick<User, "id"> & { actor_id: number };

/** A live track on this desk. Checked twice: by the query, and by the per-person rules as the signed-in person. */
export async function ownedTrack(desk: DeskActor, trackId: number) {
  if (!Number.isSafeInteger(trackId)) return undefined;
  return asPerson(desk.actor_id, () =>
    q.get<Track>("SELECT * FROM tracks WHERE id = ? AND user_id = ? AND deleted_at IS NULL", trackId, desk.id),
  );
}

/** A sender on this desk, checked the same two ways. */
export async function ownedSender(desk: DeskActor, senderId: number) {
  if (!Number.isSafeInteger(senderId)) return undefined;
  return asPerson(desk.actor_id, () => q.get<Sender>("SELECT * FROM senders WHERE id = ? AND user_id = ?", senderId, desk.id));
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

/*
 * Per-request memos for page renders: the dashboard layout and the page under it both need these, and React's
 * cache() lets them share one query. Not for transactions (those pass their own db and must read fresh).
 */
export const collectionsForView = cache((userId: number) => collectionsFor(userId));
export const capacityForView = cache((id: number, plan: User["plan"]) => capacity({ id, plan }));
export const activeCollectionForView = cache((activeCollectionId: User["active_collection_id"]) => activeCollection({ active_collection_id: activeCollectionId }));
/** The public link page and its metadata both look the receiver up; one query per request. */
export const userByHandleForView = cache((handle: string) => userByHandle(handle));
