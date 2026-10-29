import "server-only";
import { q } from "./db";

/** Who's asking for a bigger plan during the beta: ops uses this to give each person the plan that fits. */
export const REQUEST_KINDS = {
  artist: "Individual DJ or producer",
  label: "Record label",
  distributor: "Distributor",
  management: "Artist management or agency",
  media: "Radio, podcast or events",
  other: "Something else",
} as const;
export type RequestKind = keyof typeof REQUEST_KINDS;

export const VOLUMES = ["Under 20 tracks a month", "20–100 a month", "100–500 a month", "500+ a month"] as const;

export type PlanRequest = {
  id: number;
  user_id: number;
  plan: string;
  kind: RequestKind;
  org: string;
  link: string;
  volume: string;
  note: string;
  status: "pending" | "approved" | "declined" | "withdrawn";
  granted_plan: string | null;
  decision_note: string;
  decided_at: number | null;
  created_at: number;
};

/**
 * The plan ops may give for a request: the one asked for, or another offered plan at or above the person's current one.
 * Never a step down they didn't ask for: changing someone's plan otherwise is a super admin's (SUPER_ONLY, ops-perms).
 */
export function grantablePlan<P extends { id: string; position: number; retired: boolean }>(plans: P[], chosen: string, asked: string, current: string) {
  const plan = plans.find((p) => p.id === chosen && !p.retired);
  if (!plan || plan.id === asked) return plan;
  const now = plans.find((p) => p.id === current);
  return !now || plan.position >= now.position ? plan : undefined;
}

/** This person's open request, if any. */
export const pendingRequest = (userId: number) => q.get<PlanRequest>("SELECT * FROM plan_requests WHERE user_id = ? AND status = 'pending'", userId);
