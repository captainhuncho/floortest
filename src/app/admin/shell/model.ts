import type { IconName, NavGroup } from "../AdminNav";
import type { WaitingKind } from "@/lib/ops-waiting";

/**
 * The ops navigation as plain data (admin redesign B, step 2): one list of areas and pages that both today's top tabs
 * and sidebar (switch `ops_shell` off) and the new rail and panel (switch on) are built from. No server imports, so
 * tests/ops-shell.test.ts and the e2e crawl can read it.
 */
export type AreaId = "overview" | "support" | "trust" | "growth" | "product" | "platform" | "admin";
type PageDef = { href: string; label: string; icon: IconName };
type AreaDef = { id: AreaId; title: string; icon: IconName; key: string; sections: { title: string; pages: PageDef[] }[] };

/** In the rail's order (B: Overview, Support, Trust & safety, Growth, Product, Platform, Admin). `key` is the second key of "g …". */
export const AREAS: readonly AreaDef[] = [
  { id: "overview", title: "Overview", icon: "grid", key: "o", sections: [{ title: "", pages: [{ href: "/admin", label: "Overview", icon: "grid" }] }] },
  {
    id: "support",
    title: "Support",
    icon: "life",
    key: "s",
    sections: [
      { title: "Now", pages: [{ href: "/admin/inbox", label: "Inbox", icon: "inbox" }, { href: "/admin/feedback", label: "Feedback", icon: "flag" }, { href: "/admin/emails", label: "Email log", icon: "mail" }] },
      { title: "People", pages: [{ href: "/admin/accounts", label: "Users", icon: "users" }, { href: "/admin/partners", label: "Beta partners", icon: "rocket" }] },
    ],
  },
  {
    id: "trust",
    title: "Trust & safety",
    icon: "shield",
    key: "t",
    sections: [
      { title: "Review", pages: [{ href: "/admin/verification", label: "Verification", icon: "shield" }, { href: "/admin/moderation", label: "Moderation", icon: "flag" }, { href: "/admin/takedowns", label: "Takedowns", icon: "alert" }] },
      { title: "Abuse & legal", pages: [{ href: "/admin/blocks", label: "Sender blocks", icon: "shield" }, { href: "/admin/privacy", label: "Privacy requests", icon: "users" }] },
    ],
  },
  {
    id: "growth",
    title: "Growth",
    icon: "rocket",
    key: "g",
    sections: [
      { title: "Decide", pages: [{ href: "/admin/growth", label: "Growth & decisions", icon: "chart" }] },
      { title: "Beta access", pages: [{ href: "/admin/waitlist", label: "Waitlist", icon: "list" }, { href: "/admin/invites", label: "Invites", icon: "ticket" }, { href: "/admin/plan-requests", label: "Plan requests", icon: "rocket" }] },
      { title: "Reach", pages: [{ href: "/admin/announcements", label: "Announcements", icon: "mail" }] },
      { title: "Revenue", pages: [{ href: "/admin/revenue", label: "Revenue", icon: "chart" }, { href: "/admin/plans", label: "Plans & prices", icon: "list" }] },
    ],
  },
  {
    id: "product",
    title: "Product",
    icon: "chart",
    key: "p",
    sections: [
      { title: "Insight", pages: [{ href: "/admin/metrics", label: "Metrics", icon: "chart" }, { href: "/admin/usage", label: "Feature use", icon: "chart" }] },
      { title: "Control", pages: [{ href: "/admin/switches", label: "Feature switches", icon: "flag" }, { href: "/admin/content", label: "Site content", icon: "list" }] },
    ],
  },
  {
    id: "platform",
    title: "Platform",
    icon: "pulse",
    key: "l",
    sections: [
      { title: "Health", pages: [{ href: "/admin/incidents", label: "Incidents", icon: "alert" }, { href: "/admin/jobs", label: "Jobs", icon: "list" }, { href: "/admin/speed", label: "Speed", icon: "chart" }] },
      { title: "Resources", pages: [{ href: "/admin/storage", label: "Storage", icon: "grid" }] },
    ],
  },
  {
    id: "admin",
    title: "Admin",
    icon: "log",
    key: "a",
    sections: [{ title: "", pages: [{ href: "/admin/security", label: "Security", icon: "shield" }, { href: "/admin/log", label: "Admin log", icon: "log" }, { href: "/admin/team", label: "Ops team", icon: "users" }] }],
  },
];

/** Every page in the menu, in rail order. */
export const ALL_PAGES = AREAS.flatMap((a) => a.sections.flatMap((s) => s.pages.map((p) => ({ ...p, area: a.id }))));

/** The page each waiting kind is handled on, so its count shows there (ops-waiting's own links, by kind). */
export const KIND_PAGE: Record<WaitingKind, string> = {
  inbox: "/admin/inbox",
  privacy: "/admin/privacy",
  verification: "/admin/verification",
  verification_proposal: "/admin/verification",
  takedown: "/admin/takedowns",
  plan_request: "/admin/plan-requests",
  incident: "/admin/incidents",
  job_failed: "/admin/jobs",
};

/** ops-waiting's areas, as the rail names them. */
export const WAITING_AREA: Record<"support" | "safety" | "growth" | "platform", AreaId> = { support: "support", safety: "trust", growth: "growth", platform: "platform" };

/* ---------- today's navigation (switch off) ---------- */

/** Today's top tabs keep their own order and ids (Overview, Support, Growth, Product, Trust & safety, Platform, Admin). */
const LEGACY_ORDER: AreaId[] = ["overview", "support", "growth", "product", "trust", "platform", "admin"];
const LEGACY_ID: Partial<Record<AreaId, string>> = { platform: "monitor" };

/** The groups today's AdminNav, AdminTopNav and AdminMobileNav take: only pages this person can open, badges by href. */
export function legacyGroups(allowed: (href: string) => boolean, badges: Readonly<Record<string, number>>): NavGroup[] {
  return LEGACY_ORDER.map((id) => AREAS.find((a) => a.id === id)!)
    .map((a) => ({
      id: LEGACY_ID[a.id] ?? a.id,
      title: a.id === "overview" ? "" : a.title,
      icon: a.icon,
      sections: a.sections
        .map((s) => ({ title: s.title, items: s.pages.filter((p) => allowed(p.href)).map((p) => (p.href in badges ? { ...p, badge: badges[p.href] } : { ...p })) }))
        .filter((s) => s.items.length),
    }))
    .filter((g) => g.sections.length);
}

/* ---------- the new shell (switch on) ---------- */

export type ShellPage = { href: string; label: string; icon: IconName; count: number; hot: boolean };
export type ShellArea = { id: AreaId; title: string; icon: IconName; key: string; href: string; waiting: number; sections: { title: string; items: ShellPage[] }[] };

/**
 * The rail's areas for this person: pages they can't open drop out, and so does an area left with none. A page's count
 * is "hot" (lime, part of the area's "N waiting") when it comes from Waiting on me; `plain` counts (new feedback, people
 * on the waitlist) show quietly beside the page and never add to the badge.
 */
export function shellAreas(
  allowed: (href: string) => boolean,
  waiting: Partial<Record<WaitingKind, number>>,
  plain: Readonly<Record<string, number>> = {},
): ShellArea[] {
  const hot: Record<string, number> = {};
  for (const [kind, n] of Object.entries(waiting) as [WaitingKind, number][]) hot[KIND_PAGE[kind]] = (hot[KIND_PAGE[kind]] ?? 0) + (n || 0);
  return AREAS.map((a) => {
    const sections = a.sections
      .map((s) => ({
        title: s.title,
        items: s.pages.filter((p) => allowed(p.href)).map((p) => ({ ...p, count: hot[p.href] ?? plain[p.href] ?? 0, hot: (hot[p.href] ?? 0) > 0 })),
      }))
      .filter((s) => s.items.length);
    const items = sections.flatMap((s) => s.items);
    return { id: a.id, title: a.title, icon: a.icon, key: a.key, href: items[0]?.href ?? "/admin", waiting: items.reduce((n, i) => n + (i.hot ? i.count : 0), 0), sections };
  }).filter((a) => a.sections.length);
}

/** The first thing due in an area, worded on the server so the page and its first paint agree. */
export type NextDue = { title: string; subtitle: string; href: string; when: string; late: boolean };
/** Figures only from what was read: how many wait, and how many of those are past their due time (KIND_DUE_MS). */
export type AreaToday = { waiting: number; late: number; lateMore: boolean };
export type ShellData = {
  areas: ShellArea[];
  next: Partial<Record<AreaId, NextDue>>;
  today: Partial<Record<AreaId, AreaToday>>;
  /** Everything waiting on this person (the phone's Waiting tab). */
  total: number;
};

/** Whether `href` is the page at `path` (Overview only on /admin itself; others include their sub-pages). */
export const isActive = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

/** The area and page the current path sits in; Overview (or the first area) when none matches. */
export function locate(areas: readonly ShellArea[], path: string): { area: ShellArea | undefined; page: ShellPage | undefined } {
  for (const area of areas) for (const s of area.sections) for (const page of s.items) if (isActive(path, page.href)) return { area, page };
  return { area: areas.find((a) => a.id === "overview") ?? areas[0], page: undefined };
}
