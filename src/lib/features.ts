import "server-only";
import { cache } from "react";
import { q } from "./db";
import { STEMS_PLANS } from "./plans";

/** Features that can be switched on from admin, per plan or for named accounts. Code defaults apply until a switch is saved. */
export const FEATURES = {
  stems: { label: "Stems", description: "Receivers ask senders for stems; senders upload them to the track.", defaultPlans: STEMS_PLANS as readonly string[] },
  folders: { label: "Send folders", description: "Senders on this plan can send a whole folder of tracks (up to 250 MB in total) in one go.", defaultPlans: [] as readonly string[] },
  shared: { label: "Shared collections", description: "Receivers on this plan can add teammates to a collection; teammates listen and vote keep or pass.", defaultPlans: ["team"] as readonly string[] },
} as const;
export type Feature = keyof typeof FEATURES;

const load = cache(async () => {
  const rows = await q.all<{ feature: string; plans: string; users: string }>("SELECT feature, plans, users FROM feature_switches");
  const parse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return new Map(rows.map((r) => [r.feature, { plans: parse(r.plans) as string[], users: parse(r.users) as number[] }]));
});

export async function switchFor(f: Feature) {
  return (await load()).get(f) ?? { plans: [...FEATURES[f].defaultPlans], users: [] as number[] };
}

export async function featureOn(f: Feature, u: { id: number; plan: string }) {
  const s = await switchFor(f);
  return s.plans.includes(u.plan) || s.users.includes(u.id);
}
