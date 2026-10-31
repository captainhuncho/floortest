import { fmtBytes } from "@/lib/format";
import type { Plan } from "@/lib/plan-store";

/** The core tools every plan gets; plans differ in room (and, on paid plans, a few extras). */
export const SHARED = ["Permanent receiving link", "Private uploads, no sender account needed", "Listen and review", "Receipts and updates for senders", "Organise collections", "Prepare for your set", "Download tracks"];

/** Which held features may be shown: colleague sharing (switch `sharing`) and account teams (switch `teams`). */
export type Live = { sharing: boolean; teams: boolean };

/** What a plan enables, read from its settings (folders, artwork, seats), so the cards can't drift from the product. */
export const folderLine = (p: Plan) => (p.folderBytes > 0 ? `Send folders (EP or album) up to ${fmtBytes(p.folderBytes)}` : "");
export const seatsLine = (p: Plan) => `${p.seats} people on one account (you + ${p.seats - 1}), each with their own login; extra seats available`;
const ART = "Track artwork from senders";

/** Ops' own feature lines that may be shown: no capacity (shown on its own), no "everything in" pointers, nothing held. */
export function ownLines(p: Plan, live: Live) {
  const held = live.sharing ? /stems|as they launch/i : /colleague|share|teammate|stems|as they launch/i;
  return p.features.filter((f) => !/active tracks|^everything in/i.test(f) && !held.test(f));
}

/**
 * Everything a paid plan adds over the shared tools: what its settings enable, then ops' own lines (minus any that
 * repeat an enabled line). Free plans add nothing.
 */
export function extrasOf(p: Plan, live: Live) {
  if (p.price <= 0) return [];
  const enabled = [folderLine(p), p.trackArt && ART, live.teams && p.seats > 1 && seatsLine(p)].filter((f): f is string => !!f);
  const own = ownLines(p, live).filter((f) => !enabled.some((l) => l.toLowerCase() === f.toLowerCase()));
  return [...enabled, ...own];
}

/** What a plan adds over the plan before it, for "Everything in X, plus": lines the earlier plan already has drop out. */
export function addsOver(p: Plan, prev: Plan | undefined, live: Live) {
  const had = new Set((prev ? extrasOf(prev, live) : []).map((f) => f.toLowerCase()));
  return extrasOf(p, live).filter((f) => !had.has(f.toLowerCase()));
}

/** Yearly against twelve months, rounded down so we never overstate it; 0 when there's no yearly price. */
export const saving = (p: Pick<Plan, "price" | "yearly">) => (p.price && p.yearly ? Math.max(0, Math.floor((1 - p.yearly / (p.price * 12)) * 100)) : 0);

/** The best yearly saving across paid plans, for the note beside the billing switch; 0 when none is set. */
export const bestSaving = (plans: Pick<Plan, "price" | "yearly">[]) => plans.reduce((m, p) => Math.max(m, saving(p)), 0);

/** Whether any paid plan has a yearly price, so a Monthly / Yearly switch means something. */
export const hasYearly = (plans: Pick<Plan, "price" | "yearly">[]) => plans.some((p) => p.price > 0 && p.yearly > 0);

/**
 * The card that stands out: the featured plan, or the first if none is featured. On it the action is lime;
 * everything else is quiet.
 */
export const liftedId = (plans: Pick<Plan, "id" | "featured">[]) => (plans.find((p) => p.featured) ?? plans[0])?.id ?? null;
