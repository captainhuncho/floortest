import "server-only";
import { allowances } from "@/lib/allowance";
import { lastBackup } from "@/lib/backup";
import { lastRuns } from "@/lib/cron";
import { now as clock, q } from "@/lib/db";
import { configProblems } from "@/lib/env";
import { mailUsage } from "@/lib/mail-quota";
import { can, type OpsAccess } from "@/lib/ops-access";
import type { Need } from "@/lib/ops-perms";
import { KIND_AREA, KIND_NEED, LIMIT, type Area, type WaitingKind } from "@/lib/ops-waiting";
import { allPlans } from "@/lib/plan-store";
import { healthChecks, healthScore, type HealthCheck } from "../health";
import { waitingFor } from "../shell/data";
import { ALL_PAGES, KIND_PAGE } from "../shell/model";
import { AREA_TABS, dueText, headline, span } from "./model";

const DAY = 86_400_000;
/** Days in each figure's sparkline (today's Overview draws the same 14). */
export const SPARK_DAYS = 14;

/** Admin-log actions that close something Waiting on me lists, by what you need to have done them. */
const HANDLED: { need: Need; actions: Record<string, string> }[] = [
  { need: "inbox.act", actions: { "handled message": "a message marked handled" } },
  { need: "verification", actions: { "verified identity": "an identity verified", "rejected identity": "a verification declined" } },
  { need: "verification.approve", actions: { "approved verification proposal": "a verification proposal approved", "declined verification proposal": "a verification proposal declined" } },
  { need: "super", actions: { "upheld takedown": "a takedown upheld", "rejected takedown": "a takedown rejected", "deleted account (privacy request)": "a privacy request done", "erased sender (privacy request)": "a privacy request done" } },
  { need: "planRequests", actions: { "approved plan request": "a plan request approved", "declined plan request": "a plan request declined" } },
  { need: "incidents.act", actions: { "resolved incident": "an incident resolved", "resolved incidents": "incidents resolved" } },
];

/** One row of Waiting on me, worded on the server so the page and its first paint agree. */
export type Row = { kind: WaitingKind; area: Area; id: string; title: string; subtitle: string; href: string; created_at: number; due_at: number; when: string; late: boolean };
export type Tile = { href: string; label: string; kind: WaitingKind; count: number; note: string; late: boolean };
export type Kpi = { label: string; value: string; note: string; series: number[] | null };
export type Platform = {
  score: number;
  /** Checks that aren't OK, worst first. */
  issues: HealthCheck[];
  incident: { message: string; kind: string; age: string; open: number } | null;
  /** Runs logged today (a frequent job's empty runs aren't logged), for people who can open Jobs. */
  jobs: { ran: number; failed: number } | null;
};

export type OverviewData = {
  rows: Row[];
  areas: Area[];
  head: { total: number; oldest: Row | undefined; pastDue: number; pastMore: boolean; oldestAge: string };
  tiles: Tile[];
  platform: Platform | null;
  kpis: Kpi[];
  lastHandled: { what: string; ago: string } | null;
  unavailable: string[];
};

/**
 * Everything the new Overview shows, in one round of queries (Promise.all), each bounded: Waiting on me (read once per
 * request, shared with the shell), the platform's health, this week's figures and the last thing handled. Only what
 * this person may open is read; one failing query hides its own part, not the page.
 */
export async function overviewData(access: OpsAccess, allowed: (href: string) => boolean): Promise<OverviewData> {
  const t = clock();
  const unavailable: string[] = [];
  const safe = <T>(name: string, p: Promise<T>, fallback: T) =>
    p.catch((e) => {
      console.error(`ops overview: ${name}`, e);
      unavailable.push(name);
      return fallback;
    });
  const platformOn = allowed("/admin/incidents") || allowed("/admin/jobs");
  const revenueOn = allowed("/admin/revenue");
  const waitlistOn = allowed("/admin/waitlist");
  const handled = HANDLED.filter((h) => can(access, h.need)).flatMap((h) => Object.keys(h.actions));
  const dayStart = t - (t % DAY);
  const from = t - SPARK_DAYS * DAY;
  const none = Promise.resolve(null);

  const [waiting, week, daily, waitlist, plans, byPlan, handledRow, platformRaw] = await Promise.all([
    waitingFor(access),
    safe(
      "this week",
      q.get<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*) FROM tracks WHERE created_at >= ?) AS tracks,
           (SELECT COUNT(*) FROM tracks WHERE created_at >= ? AND created_at < ?) AS tracks_prev,
           (SELECT COUNT(DISTINCT user_id) FROM account_log WHERE created_at >= ?) AS active,
           (SELECT COUNT(*) FROM users) AS receivers`,
        t - 7 * DAY, t - 14 * DAY, t - 7 * DAY, t - 7 * DAY,
      ),
      undefined,
    ),
    safe("daily tracks", q.all<{ d: number; n: number }>(`SELECT FLOOR((created_at - ?) / ${DAY}) AS d, COUNT(*) AS n FROM tracks WHERE created_at >= ? GROUP BY 1`, from, from), []),
    waitlistOn ? safe("waitlist", q.count("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"), null) : none,
    revenueOn ? safe("plans", allPlans(), null) : none,
    revenueOn ? safe("revenue", q.all<{ plan: string; n: number }>("SELECT plan, COUNT(*) AS n FROM users WHERE suspended_at IS NULL AND plan <> 'free' GROUP BY plan"), null) : none,
    handled.length
      ? safe("last handled", q.get<{ action: string; created_at: number }>(`SELECT action, created_at FROM admin_log WHERE action IN (${handled.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 1`, ...handled), undefined)
      : Promise.resolve(undefined),
    platformOn
      ? Promise.all([
          safe("job runs", lastRuns(), { purge: null, digest: null, scan: null, mail: null }),
          safe("backups", lastBackup(), null),
          safe("email quota", mailUsage(), null),
          safe("storage", allowances(), []),
          safe("first account", q.get<{ at: number | null }>("SELECT MIN(created_at) AS at FROM users"), undefined),
          safe("open incident", q.get<{ message: string; kind: string; created_at: number; open: number }>("SELECT message, kind, created_at, (SELECT COUNT(*) FROM incidents WHERE resolved_at IS NULL AND kind <> 'upload_rejected') AS open FROM incidents WHERE resolved_at IS NULL AND kind <> 'upload_rejected' ORDER BY created_at DESC LIMIT 1"), undefined),
          safe("jobs today", q.get<{ ran: number; failed: number }>("SELECT COUNT(*) AS ran, COUNT(*) FILTER (WHERE ok = 0) AS failed FROM job_runs WHERE started_at >= ?", dayStart), undefined),
        ])
      : none,
  ]);

  const rows: Row[] = waiting.items.map((i) => ({ kind: i.kind, area: i.area, id: i.id, title: i.title, subtitle: i.subtitle, href: i.href, created_at: i.created_at, due_at: i.due_at, when: dueText(i.due_at, t), late: i.due_at < t }));
  const total = Object.values(waiting.counts).reduce<number>((n, c) => n + (c ?? 0), 0);
  const h = headline(rows, total, t, LIMIT);
  // A tab for each area where this person may act on something, in B's order.
  const kinds = (Object.keys(KIND_NEED) as WaitingKind[]).filter((k) => can(access, KIND_NEED[k]));
  const areas = AREA_TABS.map((a) => a.id).filter((a) => kinds.some((k) => KIND_AREA[k] === a));

  // Phone tiles: one per page that handles something this person may act on, with its full count and its first due.
  const tiles: Tile[] = [...new Set(kinds.map((k) => KIND_PAGE[k]))].map((href) => {
    const own = kinds.filter((k) => KIND_PAGE[k] === href);
    const first = rows.find((r) => KIND_PAGE[r.kind] === href);
    return { href, kind: own[0], label: ALL_PAGES.find((p) => p.href === href)?.label ?? href, count: own.reduce((n, k) => n + (waiting.counts[k] ?? 0), 0), note: first?.when ?? "Clear", late: !!first?.late };
  });

  const num = (v: unknown) => Number(v ?? 0);
  const days = Array.from({ length: SPARK_DAYS }, (_, i) => num(daily.find((r) => num(r.d) === i)?.n));
  const tracks = num(week?.tracks);
  const prev = num(week?.tracks_prev);
  const receivers = num(week?.receivers);
  const active = num(week?.active);
  const kpis: Kpi[] = [
    { label: "Tracks received", value: tracks.toLocaleString("en-GB"), note: tracks === prev ? "same as the week before" : `${tracks > prev ? "+" : "−"}${Math.abs(tracks - prev).toLocaleString("en-GB")} on the week before`, series: week ? days : null },
    ...(receivers > 0 ? [{ label: "Active receivers", value: active.toLocaleString("en-GB"), note: `of ${receivers.toLocaleString("en-GB")}, used their desk this week`, series: null }] : []),
    ...(waitlist != null ? [{ label: "Waitlist", value: waitlist.toLocaleString("en-GB"), note: "waiting for an invite", series: null }] : []),
  ];
  if (plans && byPlan) {
    // As Revenue counts it: active accounts on paid plans at list price (billing isn't connected, so not money received).
    const value = byPlan.reduce((s, r) => s + num(r.n) * (plans.find((p) => p.id === r.plan)?.price ?? 0), 0);
    kpis.push({ label: "A month at list price", value: `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, note: `${byPlan.reduce((s, r) => s + num(r.n), 0)} on paid plans`, series: null });
  }

  let platform: Platform | null = null;
  if (platformRaw) {
    const [runs, backup, mail, storage, first, incident, jobs] = platformRaw;
    const { checks } = healthChecks({ t, problems: configProblems(), backup, runs, mail, storage, firstAt: num(first?.at) });
    const shown = checks.filter((c) => allowed(c.href.split(/[?#]/)[0]) || c.href.startsWith("#"));
    const rank = { bad: 0, warn: 1, idle: 2, ok: 3 };
    platform = {
      score: healthScore(shown),
      issues: shown.filter((c) => c.tone === "bad" || c.tone === "warn").sort((a, b) => rank[a.tone] - rank[b.tone]),
      incident: incident && allowed("/admin/incidents") ? { message: incident.message, kind: incident.kind, age: span(t - num(incident.created_at)), open: num(incident.open) } : null,
      jobs: allowed("/admin/jobs") && jobs ? { ran: num(jobs.ran), failed: num(jobs.failed) } : null,
    };
  }

  const words = Object.assign({}, ...HANDLED.map((x) => x.actions)) as Record<string, string>;
  return {
    rows,
    areas,
    head: { ...h, oldestAge: h.oldest ? span(t - h.oldest.created_at) : "" },
    tiles,
    platform,
    kpis,
    lastHandled: handledRow ? { what: words[handledRow.action] ?? handledRow.action, ago: span(t - num(handledRow.created_at)) } : null,
    unavailable,
  };
}
