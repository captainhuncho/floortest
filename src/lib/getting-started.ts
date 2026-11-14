import "server-only";
import { now, q } from "./db";

/**
 * Getting started on the Floor (Desk, 13 Nov): five steps that tick themselves off from what the account owner has
 * really done. It complements the first-visit tour (src/lib/tour.ts explains FloorTest; this shows what's left to do).
 * Gone once all five are done, once hidden, or 30 days after sign-up.
 */
export const CARD_DAYS = 30;
const DAY = 86_400_000;

export type StepId = "profile" | "share" | "track" | "decide" | "twostep";
export type Step = { id: StepId; done: boolean; label: string; hint: string; href: string; action: string };

/** The facts the steps are read from: one row, one query. */
export type StartFacts = {
  cover_key: string | null;
  role_line: string | null;
  link_shared_at: number | null;
  totp_enabled_at: number | null;
  onboarding_dismissed_at: number | null;
  created_at: number;
  has_track: boolean;
  decided: boolean;
};

export function stepsFrom(f: StartFacts, handle: string): Step[] {
  return [
    { id: "profile", done: !!f.cover_key && !!f.role_line?.trim(), label: "Add a photo and a line about you", hint: "Senders see both on your public page.", href: "/dashboard/settings/profile", action: "Edit your page" },
    { id: "share", done: !!f.link_shared_at, label: "Share your link", hint: "Copy your link or a share card and post it where senders look.", href: "/dashboard/floor#your-link", action: "Copy your link" },
    { id: "track", done: f.has_track, label: "Get your first track", hint: "Send yourself a test to see what senders see.", href: `/${handle}`, action: "Send yourself a test" },
    { id: "decide", done: f.decided, label: "Keep or Not for me on a track", hint: "Play a track in the Review Queue, then decide.", href: "/dashboard/review?view=queue", action: "Open the Review Queue" },
    { id: "twostep", done: !!f.totp_enabled_at, label: "Turn on two-step sign-in", hint: "A code from your phone as well as your password.", href: "/dashboard/settings/security", action: "Turn it on" },
  ];
}

/** Whether the card shows: not hidden, within 30 days of sign-up, and something still to do. */
export function cardShows(f: StartFacts, steps: Step[], at = now()): boolean {
  if (f.onboarding_dismissed_at) return false;
  if (at - Number(f.created_at) >= CARD_DAYS * DAY) return false;
  return steps.some((s) => !s.done);
}

/**
 * Who sees the card on the Floor: the account owner on their own desk only. Never team members, never someone acting
 * for the owner (actor_id is the signed-in person), never an admin's View as.
 */
export function showsGettingStarted(user: { id: number; actor_id: number; role: string }, viewingAs: boolean): boolean {
  return user.role === "owner" && !viewingAs && user.actor_id === user.id;
}

/**
 * The card for an account owner on their own desk, or null. One query; a track moved to Projects still counts as the
 * first track (its desk row is kept, retired).
 */
export async function gettingStarted(userId: number, handle: string, at = now()): Promise<Step[] | null> {
  const f = await q.get<StartFacts>(
    `SELECT u.cover_key, u.role_line, u.link_shared_at, u.totp_enabled_at, u.onboarding_dismissed_at, u.created_at,
       EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id) AS has_track,
       EXISTS (SELECT 1 FROM tracks t WHERE t.user_id = u.id AND t.decision IS NOT NULL) AS decided
     FROM users u WHERE u.id = ?`,
    userId,
  );
  if (!f) return null;
  const steps = stepsFrom(f, handle);
  return cardShows(f, steps, at) ? steps : null;
}

/** First copy or share of the link: set once on the person's own row. */
export async function noteLinkShared(userId: number) {
  await q.run("UPDATE users SET link_shared_at = ? WHERE id = ? AND link_shared_at IS NULL", now(), userId);
}
