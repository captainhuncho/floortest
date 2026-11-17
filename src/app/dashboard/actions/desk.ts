"use server";

/** Around the desk: feedback, onboarding, the Send page lookup, notifications, search and pausing the link. */
import { markBell } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { receiverLookup } from "@/lib/receiver-lookup";
import { requirePerson, requireUser, requireRole } from "@/lib/auth";
import { now, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { closeFeedbackAskFor, fileFeedback, markFeedbackAsked } from "@/lib/feedback";
import { sendReopenAlerts } from "@/lib/reopen";
import { done } from "./common";
import { markTourSeenFor } from "@/lib/tour-seen";
import { dismissNoticeFor } from "@/lib/site-notices";
import { noteLinkShared } from "@/lib/getting-started";
import { searchDesk, type SearchHit } from "@/lib/search";
import { allow } from "@/lib/ratelimit";

/** Beta feedback, signed by the person who sent it (src/lib/feedback.ts). */
export async function sendFeedback(kind: string, message: string, path: string, fromAsk = false, viewport?: number) {
  const u = await requireUser();
  await fileFeedback(u, kind, message, path, viewport);
  if (fromAsk) await markFeedbackAsked(u.actor_id);
}

/** "Not now" (asks once more after 10 decisions) or "Don't ask again" on the feedback ask (lib/feedback-ask). */
export async function closeFeedbackAsk(choice: "later" | "never" = "never") {
  const u = await requireUser();
  await closeFeedbackAskFor(u.actor_id, choice === "later" ? "later" : "never");
}

export async function dismissOnboarding() {
  const u = await requireRole("admin");
  await q.run("UPDATE users SET onboarding_dismissed_at = ? WHERE id = ?", now(), u.id);
  done();
}

/** Closes an Ops notice for the signed-in person (their own row, never the desk's); it isn't rendered for them again. */
export async function dismissNotice(noticeId: number) {
  // requirePerson: the person, not a team desk; in an admin's view it redirects first.
  const me = await requirePerson();
  return dismissNoticeFor(me.id, Number(noticeId));
}

/** The person copied or shared their link or a share card: Getting started's "Share your link" ticks itself off. */
export async function markLinkShared() {
  // requirePerson: the signed-in person's own row; in an admin's view it redirects first.
  const me = await requirePerson();
  await noteLinkShared(me.id);
}

/** The first-visit tour was closed or finished: it never opens by itself again for this person (their own row, not the
 * desk's, so each teammate gets it once). How FloorTest works replays it any time. */
export async function markTourSeen() {
  // requirePerson: the signed-in person, never the team desk they're working on; in an admin's view it redirects first.
  const me = await requirePerson();
  await markTourSeenFor(me.id);
}

export type { ReceiverLookup } from "@/lib/receiver-lookup";

/** Who is floortest.../<handle>? Used by the Send page as you type. */
export async function lookupReceiver(raw: string) {
  return receiverLookup(await requireUser(), raw);
}

/** "Clear all": the bell starts empty again. Live alerts (desk full, paused) stay while they're true. */
export async function clearNotifications() {
  const u = await requireUser();
  await markBell(u, true);
  done();
}

export async function markNotificationsRead() {
  const u = await requireUser();
  await markBell(u, false);
  done();
}

export type { SearchHit } from "@/lib/search";

/** Searches per person per window before quickSearch answers nothing (typing at full speed is about 7 a second after the debounce). */
const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_MS = 10_000;

/**
 * Type-ahead for the search dialog: a few tracks and contacts that match the query or come close (typos). Over the
 * per-person limit, or if the search fails (the 2 s timeout), it answers no results; the error goes to the server log
 * without the search words.
 */
export async function quickSearch(query: string): Promise<SearchHit[]> {
  const u = await requireUser();
  if (!(await allow("quick_search", String(u.actor_id), SEARCH_LIMIT, SEARCH_WINDOW_MS))) return [];
  try {
    return await searchDesk(u, query);
  } catch (e) {
    console.error("[search] quickSearch failed", u.actor_id, e instanceof Error ? e.message : "unknown error");
    return [];
  }
}

export async function pauseLink(form: FormData) {
  const u = await requireRole("admin");
  const message = String(form.get("message") || "").trim().slice(0, 280);
  const until = String(form.get("until") || "");
  const offset = Number(form.get("tz") || 0);
  // "Until 12 Oct" means back on the morning of the 12th, receiver's local time.
  const untilAt = /^\d{4}-\d{2}-\d{2}$/.test(until) ? Date.parse(`${until}T00:00:00Z`) + (Number.isFinite(offset) ? offset : 0) * 60_000 : null;
  await q.run("UPDATE users SET paused_at = ?, pause_until = ?, pause_message = ? WHERE id = ?", now(), untilAt && untilAt > now() ? untilAt : null, message, u.id);
  await audit(u.id, "link_paused", message);
  done();
  revalidatePath(`/${u.handle}`);
}

export async function resumeLink() {
  const u = await requireRole("admin");
  await q.run("UPDATE users SET paused_at = NULL, pause_until = NULL WHERE id = ?", u.id);
  await audit(u.id, "link_resumed");
  await sendReopenAlerts(u.id, { inRequest: true });
  done();
  revalidatePath(`/${u.handle}`);
}
