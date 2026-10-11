import "server-only";
import { cache } from "react";
import { q, type Queryable } from "./db";

/** A plan as Admin → Plans defines it. Prices are in US dollars. */
export type Plan = {
  id: string;
  name: string;
  price: number;
  /** Price per year in US dollars; 0 while not set. */
  yearly: number;
  limit: number;
  blurb: string;
  features: string[];
  /** Colleagues can download tracks this plan's receivers share. */
  shareDownloads: boolean;
  /** Senders can attach artwork to tracks they send this plan's receivers. */
  trackArt: boolean;
  /** Shown with a Recommended badge on plan cards. */
  featured: boolean;
  position: number;
  /** Retired plans keep their current users but aren't offered to anyone new. */
  retired: boolean;
  /** Largest EP/album folder this plan's receivers accept, in bytes; 0 means folders are off. */
  folderBytes: number;
  /** A percentage off list price (0 = none), with an optional label and end time. List prices stay as they are. */
  discount: { pct: number; label: string; endsAt: number | null };
};

/** The discount running on a plan right now, or 0. */
export const discountNow = (p: Pick<Plan, "price" | "discount">, at = Date.now()) =>
  p.price > 0 && p.discount.pct > 0 && (!p.discount.endsAt || p.discount.endsAt > at) ? p.discount.pct : 0;

/** A price after a percentage off, to the cent. */
export const afterDiscount = (amount: number, pct: number) => Math.round(amount * (100 - pct)) / 100;

/** Every account starts here, and it can't be retired or deleted. */
export const FREE_PLAN = "free";

type Row = { id: string; name: string; price_cents: number; yearly_price_cents: number; discount_pct: number; discount_label: string; discount_ends_at: number | null; track_limit: number; blurb: string; features: string; share_downloads: number; track_art: number; featured: number; position: number; retired_at: number | null; folder_bytes: number };
const toPlan = (r: Row): Plan => {
  let features: string[] = [];
  try {
    const f = JSON.parse(r.features);
    if (Array.isArray(f)) features = f.map(String);
  } catch {}
  return { id: r.id, name: r.name, price: r.price_cents / 100, yearly: (Number(r.yearly_price_cents) || 0) / 100, limit: r.track_limit, blurb: r.blurb, features, shareDownloads: !!r.share_downloads, trackArt: !!Number(r.track_art), featured: !!r.featured, position: r.position, retired: !!r.retired_at, folderBytes: Number(r.folder_bytes) || 0, discount: { pct: Number(r.discount_pct) || 0, label: r.discount_label ?? "", endsAt: r.discount_ends_at == null ? null : Number(r.discount_ends_at) } };
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

/**
 * Whether senders can attach artwork to tracks for receivers on `plan`. Inside a transaction, plan details must be
 * read on the transaction's own connection (`db`): reading through the shared pool would wait for a second connection
 * while the first is held, and with a small pool that can freeze.
 */
export async function trackArtEnabled(plan: string, db: Queryable = q) {
  const r = await db.get<{ a: number }>("SELECT track_art AS a FROM plans WHERE id = ?", plan);
  return !!Number(r?.a);
}

/** An account's plan track limit, read on `db` (see above); an unknown plan counts as Free. */
export async function planLimit(plan: string, db: Queryable = q) {
  const r = await db.get<{ n: number }>("SELECT track_limit AS n FROM plans WHERE id IN (?, ?) ORDER BY (id = ?) DESC LIMIT 1", plan, FREE_PLAN, plan);
  return r?.n ?? 0;
}

/** A receiver's folder limit, read on `db` (see the note above trackArtEnabled); 0 when their plan doesn't accept folders. */
export async function folderLimit(plan: string, db: Queryable = q) {
  const r = await db.get<{ b: number }>("SELECT folder_bytes AS b FROM plans WHERE id = ?", plan);
  return Number(r?.b) || 0;
}
