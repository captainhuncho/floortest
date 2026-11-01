import "server-only";
import { cache } from "react";
import { q } from "@/lib/db";
import type { OpsAccess } from "@/lib/ops-access";
import { LIMIT, waitingOnMe, type WaitingItem } from "@/lib/ops-waiting";
import { shellAreas, WAITING_AREA, type AreaId, type AreaToday, type NextDue, type ShellData } from "./model";

/** Waiting on me, read once per request however many parts of the page ask (the shell now, the Overview later). */
export const waitingFor = cache(waitingOnMe);


const ago = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
};

/** "Due in 2 h" or "3 h late", from when it is due. */
export const dueWords = (dueAt: number, now: number) => (dueAt >= now ? `Due in ${ago(dueAt - now)}` : `${ago(now - dueAt)} late`);

/** Each area's first due item (Overview: the first of all) and how many are past the target, from one sorted list. */
export function nextAndLate(items: readonly WaitingItem[], now: number) {
  const next: Partial<Record<AreaId, NextDue>> = {};
  const late: Partial<Record<AreaId, number>> = {};
  for (const i of items) {
    for (const area of ["overview", WAITING_AREA[i.area]] as AreaId[]) {
      next[area] ??= { title: i.title, subtitle: i.subtitle, href: i.href, when: dueWords(i.due_at, now), late: i.due_at < now };
      if (i.due_at < now) late[area] = (late[area] ?? 0) + 1;
    }
  }
  return { next, late };
}

/**
 * Everything the new shell shows besides the page: the areas this person can open with their counts (Waiting on me
 * for the badges; new feedback and the waitlist as quiet counts), each area's next due item and its figures.
 */
export async function shellData(access: OpsAccess, allowed: (href: string) => boolean): Promise<ShellData> {
  const count = (href: string, sql: string) => (allowed(href) ? q.count(sql) : Promise.resolve(0));
  const [waiting, feedback, waitlist] = await Promise.all([
    waitingFor(access),
    count("/admin/feedback", "SELECT COUNT(*) AS n FROM contact_messages WHERE topic LIKE 'Feedback%' AND feedback_status = 'new'"),
    count("/admin/waitlist", "SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
  ]);
  const areas = shellAreas(allowed, waiting.counts, { "/admin/feedback": feedback, "/admin/waitlist": waitlist });
  const { next, late } = nextAndLate(waiting.items, Date.now());
  const total = areas.reduce((n, a) => n + a.waiting, 0);
  // Late counts come from the list, which stops at LIMIT items: past that, "or more".
  const lateMore = waiting.items.length >= LIMIT;
  const today: Partial<Record<AreaId, AreaToday>> = Object.fromEntries(
    [...areas.filter((a) => a.waiting).map((a) => [a.id, a.waiting] as const), ...(total ? [["overview", total] as const] : [])].map(([id, n]) => [id, { waiting: n, late: late[id] ?? 0, lateMore }]),
  );
  return { areas, next, today, total };
}
