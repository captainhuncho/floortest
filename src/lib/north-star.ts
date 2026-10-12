import type { Queryable } from "./db/client";

/**
 * FloorTest's north star (PRODUCT.md, Launch Decisions): the share of tracks that get a decision within 7 days of arriving.
 * A track counts only once its 7 days are over, so a week still in progress never looks worse than it is. A track deleted
 * without a decision counts as not decided. Split by the receiver's plan (today's plan) and by solo or team desk.
 */
export const DECIDE_WITHIN = 7 * 86_400_000;

export type NorthStarRow = { tracks: number; decided: number };
export type NorthStar = {
  weeks: ({ from: number; to: number } & NorthStarRow)[];
  total: NorthStarRow;
  byPlan: Record<string, NorthStarRow>;
  bySize: { solo: NorthStarRow; team: NorthStarRow };
};

export async function northStar(db: Queryable, weekStarts: number[], until: number, at: number): Promise<NorthStar> {
  const cutoff = at - DECIDE_WITHIN;
  const first = weekStarts[0] ?? until;
  const last = Math.min(until, cutoff);
  const rows = await db.all<{ created_at: number; decided_at: number | null; plan: string; team: boolean }>(
    `SELECT t.created_at, t.decided_at, u.plan, EXISTS (SELECT 1 FROM account_members m WHERE m.account_id = u.id) AS team
     FROM tracks t JOIN users u ON u.id = t.user_id
     WHERE t.created_at >= ? AND t.created_at < ?`,
    first,
    last,
  );
  const empty = (): NorthStarRow => ({ tracks: 0, decided: 0 });
  const add = (r: NorthStarRow, ok: boolean) => {
    r.tracks++;
    if (ok) r.decided++;
  };
  const weeks = weekStarts.map((from, i) => ({ from, to: weekStarts[i + 1] ?? until, ...empty() }));
  const total = empty();
  const byPlan: Record<string, NorthStarRow> = {};
  const bySize = { solo: empty(), team: empty() };
  for (const r of rows) {
    const created = Number(r.created_at);
    const ok = r.decided_at != null && Number(r.decided_at) - created <= DECIDE_WITHIN;
    const week = weeks.find((w) => created >= w.from && created < w.to);
    if (week) add(week, ok);
    add(total, ok);
    add((byPlan[r.plan] ??= empty()), ok);
    add(r.team ? bySize.team : bySize.solo, ok);
  }
  return { weeks, total, byPlan, bySize };
}
