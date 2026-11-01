import { can, requireAdmin } from "@/lib/admin";
import { needFor, ROLES } from "@/lib/ops-perms";
import { q } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { currentTheme, themeClass } from "@/lib/theme";
import "./admin.css";
import { AdminNav, AdminTopNav, type NavGroup } from "./AdminNav";
import { Toast } from "./AdminUi";
import { AdminMobileNav } from "./AdminMobileNav";
import { SkipLink } from "@/components/SkipLink";

export const metadata = { title: "Admin — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";



export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const access = admin.access;
  const allowed = (href: string) => can(access, needFor(href));
  // Badge counts, only for what this person can open, all at once.
  const count = (href: string, sql: string) => (allowed(href) ? q.count(sql) : Promise.resolve(0));
  const [feedback, inbox, waiting, incidents, verifying, takedowns, planAsks] = await Promise.all([
    count("/admin/feedback", "SELECT COUNT(*) AS n FROM contact_messages WHERE topic LIKE 'Feedback%' AND feedback_status = 'new'"),
    count("/admin/inbox", "SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic NOT LIKE 'Feedback%'"),
    count("/admin/waitlist", "SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
    count("/admin/incidents", "SELECT COUNT(*) AS n FROM incidents WHERE resolved_at IS NULL AND kind <> 'upload_rejected'"),
    count("/admin/verification", "SELECT COUNT(*) AS n FROM users WHERE identity_status = 'pending'"),
    count("/admin/takedowns", "SELECT COUNT(*) AS n FROM takedowns WHERE status = 'open'"),
    count("/admin/plan-requests", "SELECT COUNT(*) AS n FROM plan_requests WHERE status = 'pending'"),
  ]);
  // Grouped by the question being asked; Overview sits on its own at the top, the admin tools at the bottom.
  const allGroups: NavGroup[] = [
    { id: "overview", title: "", icon: "grid", sections: [{ title: "", items: [{ href: "/admin", label: "Overview", icon: "grid" }] }] },
    {
      id: "support",
      title: "Support",
      icon: "life",
      sections: [
        { title: "Now", items: [{ href: "/admin/inbox", label: "Inbox", icon: "inbox", badge: inbox }, { href: "/admin/feedback", label: "Feedback", icon: "flag", badge: feedback }, { href: "/admin/emails", label: "Email log", icon: "mail" }] },
        { title: "People", items: [{ href: "/admin/accounts", label: "Users", icon: "users" }, { href: "/admin/partners", label: "Beta partners", icon: "rocket" }] },
      ],
    },
    {
      id: "growth",
      title: "Growth",
      icon: "rocket",
      sections: [
        { title: "Decide", items: [{ href: "/admin/growth", label: "Growth & decisions", icon: "chart" }] },
        { title: "Beta access", items: [{ href: "/admin/waitlist", label: "Waitlist", icon: "list", badge: waiting }, { href: "/admin/invites", label: "Invites", icon: "ticket" }, { href: "/admin/plan-requests", label: "Plan requests", icon: "rocket", badge: planAsks }] },
        { title: "Reach", items: [{ href: "/admin/announcements", label: "Announcements", icon: "mail" }] },
        { title: "Revenue", items: [{ href: "/admin/revenue", label: "Revenue", icon: "chart" }, { href: "/admin/plans", label: "Plans & prices", icon: "list" }] },
      ],
    },
    {
      id: "product",
      title: "Product",
      icon: "chart",
      sections: [
        { title: "Insight", items: [{ href: "/admin/metrics", label: "Metrics", icon: "chart" }, { href: "/admin/usage", label: "Feature use", icon: "chart" }] },
        { title: "Control", items: [{ href: "/admin/switches", label: "Feature switches", icon: "flag" }, { href: "/admin/content", label: "Site content", icon: "list" }] },
      ],
    },
    {
      id: "trust",
      title: "Trust & safety",
      icon: "shield",
      sections: [
        { title: "Review", items: [{ href: "/admin/verification", label: "Verification", icon: "shield", badge: verifying }, { href: "/admin/moderation", label: "Moderation", icon: "flag" }, { href: "/admin/takedowns", label: "Takedowns", icon: "alert", badge: takedowns }] },
        { title: "Abuse & legal", items: [{ href: "/admin/blocks", label: "Sender blocks", icon: "shield" }, { href: "/admin/privacy", label: "Privacy requests", icon: "users" }] },
      ],
    },
    {
      id: "monitor",
      title: "Platform",
      icon: "pulse",
      sections: [
        { title: "Health", items: [{ href: "/admin/incidents", label: "Incidents", icon: "alert", badge: incidents }, { href: "/admin/jobs", label: "Jobs", icon: "list" }, { href: "/admin/speed", label: "Speed", icon: "chart" }] },
        { title: "Resources", items: [{ href: "/admin/storage", label: "Storage", icon: "grid" }] },
      ],
    },
    {
      id: "admin",
      title: "Admin",
      icon: "log",
      sections: [{ title: "", items: [{ href: "/admin/security", label: "Security", icon: "shield" }, { href: "/admin/log", label: "Admin log", icon: "log" }, { href: "/admin/team", label: "Ops team", icon: "users" }] }],
    },
  ];
  // Each person sees only what they can open; empty sections and groups drop out.
  const groups = allGroups
    .map((g) => ({ ...g, sections: g.sections.map((sec) => ({ ...sec, items: sec.items.filter((i) => allowed(i.href)) })).filter((sec) => sec.items.length) }))
    .filter((g) => g.sections.length);
  const roleLabel = access.super ? "Super admin" : ROLES[access.role];
  const initials = admin.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const notice = await readFlash();
  return (
    <div id="theme-root" className={`${themeClass(await currentTheme())} md:flex`}>
      <SkipLink />
      <div className="sticky top-0 hidden h-dvh md:block">
        <AdminNav groups={groups} admin={{ name: admin.name, initials, role: roleLabel }} />
      </div>
      <AdminMobileNav groups={groups} />
      <div className="admin-canvas min-w-0 flex-1">
        <AdminTopNav groups={groups} />
        <main id="main" className="mx-auto max-w-[1240px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 md:py-8">
          {children}
        </main>
      </div>
      <Toast flash={notice} />
    </div>
  );
}
