import "server-only";
import { cache } from "react";
import { q } from "./db";

/** A plan as Admin → Plans defines it. Prices are in US dollars. */
export type Plan = {
  id: string;
  name: string;
  price: number;
  limit: number;
  blurb: string;
  features: string[];
  /** Colleagues can download tracks this plan's receivers share. */
  shareDownloads: boolean;
  /** Shown with a Recommended badge on plan cards. */
  featured: boolean;
  position: number;
  /** Retired plans keep their current users but aren't offered to anyone new. */
  retired: boolean;
};

/** Every account starts here, and it can't be retired or deleted. */
export const FREE_PLAN = "free";

type Row = { id: string; name: string; price_cents: number; track_limit: number; blurb: string; features: string; share_downloads: number; featured: number; position: number; retired_at: number | null };
const toPlan = (r: Row): Plan => {
  let features: string[] = [];
  try {
    const f = JSON.parse(r.features);
    if (Array.isArray(f)) features = f.map(String);
  } catch {}
  return { id: r.id, name: r.name, price: r.price_cents / 100, limit: r.track_limit, blurb: r.blurb, features, shareDownloads: !!r.share_downloads, featured: !!r.featured, position: r.position, retired: !!r.retired_at };
};

/** All plans, retired ones included, in display order. Read once per request. */
export const allPlans = cache(async (): Promise<Plan[]> =>
  (await q.all<Row>("SELECT * FROM plans ORDER BY position, price_cents, id")).map(toPlan),
);

/** Plans offered today (not retired), cheapest first by display order. */
export async function offeredPlans() {
  return (await allPlans()).filter((p) => !p.retired);
}

/** The plan an account is on. An unknown id (shouldn't happen: the database checks it) is treated as Free. */
export async function planOf(id: string): Promise<Plan> {
  const plans = await allPlans();
  return plans.find((p) => p.id === id) ?? plans.find((p) => p.id === FREE_PLAN)!;
}

/** A plan someone may move to now: it exists and isn't retired. */
export async function offeredPlan(id: string) {
  return (await offeredPlans()).find((p) => p.id === id);
}

/** Grid columns for a row of plan cards, so 2, 3 or 4 plans all sit neatly. */
export const planGrid = (n: number) => (n >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : n === 2 ? "md:grid-cols-2" : n === 1 ? "" : "md:grid-cols-3");

export async function shareDownloadEnabled(plan: string) {
  return (await planOf(plan)).shareDownloads;
}
