import type { IconName } from "../AdminNav";
import type { Area, WaitingItem, WaitingKind } from "@/lib/ops-waiting";

/**
 * The new Overview's plain rules (admin redesign B, step 3; switch `ops_shell`): the headline's figures, the area
 * filter and its counts, and the fold. No server imports and no clock of its own (the server passes `now`), so
 * tests/ops-overview.test.ts can run them and the page and its first paint agree.
 */

/** Rows shown before "Show N more". */
export const FOLD_AT = 6;

/** The filter tabs in B's order; an area shows only when this person may act on something in it. */
export const AREA_TABS: readonly { id: Area; label: string }[] = [
  { id: "support", label: "Support" },
  { id: "safety", label: "Safety" },
  { id: "growth", label: "Growth" },
  { id: "platform", label: "Platform" },
];
export type AreaFilter = "all" | Area;

/** Each kind's icon and the one thing its row offers (a link to the page that handles it, unless the row does it in place). */
export const KIND_ROW: Record<WaitingKind, { icon: IconName; label: string; action: string }> = {
  inbox: { icon: "inbox", label: "Inbox", action: "Mark handled" },
  privacy: { icon: "users", label: "Privacy request", action: "Open request" },
  verification: { icon: "shield", label: "Verification", action: "Review" },
  verification_proposal: { icon: "shield", label: "Verification proposal", action: "Review" },
  takedown: { icon: "alert", label: "Takedown", action: "Decide" },
  plan_request: { icon: "rocket", label: "Plan request", action: "Review" },
  incident: { icon: "pulse", label: "Incident", action: "Look into it" },
  job_failed: { icon: "list", label: "Job", action: "Open Jobs" },
};

/** Due soonest first, then the one that arrived first (ops-waiting sends them so; kept here so the rule is tested). */
export const byDue = (a: Pick<WaitingItem, "due_at" | "created_at">, b: Pick<WaitingItem, "due_at" | "created_at">) => a.due_at - b.due_at || a.created_at - b.created_at;

type Timed = Pick<WaitingItem, "due_at" | "created_at">;

/**
 * The headline: how many wait (the full open count, which can be more than the list holds), the oldest item (arrived
 * first) and how many in the list are past their due time. `pastMore` when the list was cut, so "or more" is honest.
 */
export function headline<T extends Timed>(items: readonly T[], total: number, now: number, limit: number) {
  let oldest: T | undefined;
  let pastDue = 0;
  for (const i of items) {
    if (!oldest || i.created_at < oldest.created_at) oldest = i;
    if (i.due_at < now) pastDue++;
  }
  return { total: Math.max(total, items.length), oldest, pastDue, pastMore: items.length >= limit };
}

/** The list for one tab, in due order. */
export function inArea<T extends Timed & { area: Area }>(items: readonly T[], filter: AreaFilter): T[] {
  return (filter === "all" ? [...items] : items.filter((i) => i.area === filter)).sort(byDue);
}

/** How many rows each tab holds ("all" included); tabs this person can't act in are left out. */
export function areaCounts(items: readonly { area: Area }[], areas: readonly Area[]): Record<AreaFilter, number> {
  const counts = { all: items.length } as Record<AreaFilter, number>;
  for (const a of areas) counts[a] = 0;
  for (const i of items) if (i.area in counts) counts[i.area]++;
  return counts;
}

/** The rows shown and how many are folded away: the first FOLD_AT until opened, all of them once open. */
export function fold<T>(list: readonly T[], open: boolean, at = FOLD_AT) {
  const shown = open || list.length <= at ? [...list] : list.slice(0, at);
  return { shown, hidden: list.length - shown.length };
}

/** "45 min", "3 h", "2 d". */
export function span(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** A row's time: "3 h late" once past due, otherwise "due in 2 d". */
export const dueText = (dueAt: number, now: number) => (dueAt < now ? `${span(now - dueAt)} late` : `due in ${span(dueAt - now)}`);

/** "1 thing is" / "4 things are". */
export const things = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "thing is" : "things are"}`;
