import "server-only";
import { q } from "@/lib/db";
import { JOBS, lastRuns, type JobName } from "@/lib/cron";
import { can, type OpsAccess } from "@/lib/ops-access";
import type { Need } from "@/lib/ops-perms";

/**
 * Ops → Overview → "Waiting on me" (ops redesign B, 1 Nov): everything across ops that is waiting for a person, in one
 * list. Only what this viewer may act on is read at all; each kind is read with named columns and its own LIMIT, then
 * the lot is sorted by when it's due (KIND_DUE_MS after it arrived), soonest first, and cut to LIMIT. The counts are the
 * full open counts per kind, for the rail's badges.
 */
export const LIMIT = 50;

export type WaitingKind = "inbox" | "privacy" | "verification" | "verification_proposal" | "takedown" | "plan_request" | "incident" | "job_failed";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * How long each kind may wait before it's late, the one source for the shell's "Next due" and the Overview. The same
 * targets as the Overview's Act now (admin/page.tsx dueDays, 1 Nov): privacy 21 days (inside the legal month),
 * takedowns 2 days, plan requests 2 days, inbox 3 days. Verification a day; incidents and failed jobs an hour.
 */
export const KIND_DUE_MS: Record<WaitingKind, number> = {
  inbox: 3 * DAY,
  privacy: 21 * DAY,
  verification: DAY,
  verification_proposal: DAY,
  takedown: 2 * DAY,
  plan_request: 2 * DAY,
  incident: HOUR,
  job_failed: HOUR,
};
export type Area = "support" | "safety" | "growth" | "platform";

/** Where each kind sits in the rail, so the panel groups and filters without its own map. */
export const KIND_AREA: Record<WaitingKind, Area> = {
  inbox: "support",
  privacy: "safety",
  verification: "safety",
  verification_proposal: "safety",
  takedown: "safety",
  plan_request: "growth",
  incident: "platform",
  job_failed: "platform",
};

/** What a viewer needs to act on each kind (as the pages that handle them ask). */
export const KIND_NEED: Record<WaitingKind, Need> = {
  inbox: "inbox.act",
  privacy: "super",
  verification: "verification",
  verification_proposal: "verification.approve",
  takedown: "super",
  plan_request: "planRequests",
  incident: "incidents.act",
  job_failed: "jobs",
};

const HREF: Record<WaitingKind, string> = {
  inbox: "/admin/inbox",
  privacy: "/admin/privacy",
  verification: "/admin/verification",
  verification_proposal: "/admin/verification",
  takedown: "/admin/takedowns",
  plan_request: "/admin/plan-requests",
  incident: "/admin/incidents",
  job_failed: "/admin/jobs",
};

export type WaitingItem = {
  kind: WaitingKind;
  area: Area;
  /** The row's id (the job's name for a failed job). */
  id: string;
  title: string;
  subtitle: string;
  created_at: number;
  due_at: number;
  need: Need;
  href: string;
};

type Row = { id: number | string; title: string; subtitle: string; created_at: number };
type Source = { rows: () => Promise<Row[]>; count: () => Promise<number> };

/** Each kind's open rows (named columns, oldest first, capped) and its full open count. Inbox leaves out feedback and privacy requests, which have their own places. */
const SOURCES: Record<Exclude<WaitingKind, "job_failed">, Source> = {
  inbox: {
    rows: () => q.all<Row>(`SELECT id, CASE WHEN name <> '' THEN name ELSE email END AS title, topic AS subtitle, created_at FROM contact_messages WHERE handled_at IS NULL AND topic NOT LIKE 'Feedback%' AND topic <> 'Privacy request' ORDER BY created_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic NOT LIKE 'Feedback%' AND topic <> 'Privacy request'"),
  },
  privacy: {
    rows: () => q.all<Row>(`SELECT id, email AS title, 'Privacy request' AS subtitle, created_at FROM contact_messages WHERE handled_at IS NULL AND topic = 'Privacy request' ORDER BY created_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic = 'Privacy request'"),
  },
  verification: {
    rows: () => q.all<Row>(`SELECT id, '@' || handle AS title, 'Asked to be verified' AS subtitle, COALESCE(identity_submitted_at, created_at) AS created_at FROM users WHERE identity_status = 'pending' ORDER BY identity_submitted_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM users WHERE identity_status = 'pending'"),
  },
  verification_proposal: {
    rows: () => q.all<Row>(`SELECT p.id, '@' || u.handle AS title, 'Staff proposal to approve' AS subtitle, p.created_at FROM verification_proposals p JOIN users u ON u.id = p.user_id WHERE p.status = 'pending' ORDER BY p.created_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM verification_proposals WHERE status = 'pending'"),
  },
  takedown: {
    rows: () => q.all<Row>(`SELECT id, CASE WHEN track_label <> '' THEN track_label ELSE 'A track' END AS title, 'Claim by ' || claimant AS subtitle, created_at FROM takedowns WHERE status = 'open' ORDER BY created_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM takedowns WHERE status = 'open'"),
  },
  plan_request: {
    rows: () => q.all<Row>(`SELECT r.id, '@' || u.handle AS title, 'Asks for ' || r.plan AS subtitle, r.created_at FROM plan_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.created_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM plan_requests WHERE status = 'pending'"),
  },
  incident: {
    // Rejected uploads are a sender's problem, not ops' (as the rail's badge counts them).
    rows: () => q.all<Row>(`SELECT id, message AS title, kind AS subtitle, created_at FROM incidents WHERE resolved_at IS NULL AND kind <> 'upload_rejected' ORDER BY created_at LIMIT ${LIMIT}`),
    count: () => q.count("SELECT COUNT(*) AS n FROM incidents WHERE resolved_at IS NULL AND kind <> 'upload_rejected'"),
  },
};

/** Jobs whose latest run failed (a job that is only late shows on the Overview's health, not here). */
async function failedJobs(): Promise<Row[]> {
  const runs = await lastRuns();
  return (Object.keys(JOBS) as JobName[]).flatMap((j) => (runs[j] && !runs[j]!.ok ? [{ id: j, title: `${JOBS[j].label} failed`, subtitle: "Last run failed", created_at: runs[j]!.at }] : []));
}

export async function waitingOnMe(access: OpsAccess): Promise<{ items: WaitingItem[]; counts: Partial<Record<WaitingKind, number>> }> {
  const kinds = (Object.keys(KIND_NEED) as WaitingKind[]).filter((k) => can(access, KIND_NEED[k]));
  const read = await Promise.all(
    kinds.map(async (k) => {
      if (k === "job_failed") {
        const rows = await failedJobs();
        return { k, rows, count: rows.length };
      }
      const [rows, count] = await Promise.all([SOURCES[k].rows(), SOURCES[k].count()]);
      return { k, rows, count };
    }),
  );
  const items = read
    .flatMap(({ k, rows }) =>
      rows.map((r) => ({ kind: k, area: KIND_AREA[k], id: String(r.id), title: r.title, subtitle: r.subtitle, created_at: Number(r.created_at), due_at: Number(r.created_at) + KIND_DUE_MS[k], need: KIND_NEED[k], href: HREF[k] })),
    )
    .sort((a, b) => a.due_at - b.due_at || a.created_at - b.created_at)
    .slice(0, LIMIT);
  return { items, counts: Object.fromEntries(read.map(({ k, count }) => [k, count])) };
}
