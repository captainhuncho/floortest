import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { currentTheme, themeClass } from "@/lib/theme";
import { AdminNav, type NavGroup } from "./AdminNav";
import { Toast } from "./AdminUi";
import { AdminMobileNav } from "./AdminMobileNav";
import { SkipLink } from "@/components/SkipLink";

export const metadata = { title: "Admin — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";



export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Counts that need attention, shown as badges.
  const feedback = await q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE topic LIKE 'Feedback%' AND feedback_status = 'new'");
  const [inbox, waiting, incidents, verifying] = [
    await q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL AND topic NOT LIKE 'Feedback%'"),
    await q.count("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
    await q.count("SELECT COUNT(*) AS n FROM incidents WHERE resolved_at IS NULL AND kind <> 'upload_rejected'"),
    await q.count("SELECT COUNT(*) AS n FROM users WHERE identity_status = 'pending'"),
  ];
  const takedowns = await q.count("SELECT COUNT(*) AS n FROM takedowns WHERE status = 'open'");
  const groups: NavGroup[] = [
    {
      id: "monitor",
      title: "Monitor",
      icon: "pulse",
      sections: [
        {
          title: "Health",
          items: [
            { href: "/admin", label: "Overview", icon: "grid" },
            { href: "/admin/metrics", label: "Metrics", icon: "chart" }, { href: "/admin/revenue", label: "Revenue & plans", icon: "chart" }, { href: "/admin/storage", label: "Storage & costs", icon: "grid" }, { href: "/admin/speed", label: "Speed", icon: "chart" }, { href: "/admin/jobs", label: "Jobs", icon: "list" },
            { href: "/admin/incidents", label: "Incidents", icon: "alert", badge: incidents },
            { href: "/admin/security", label: "Security", icon: "shield" },
          ],
        },
      ],
    },
    {
      id: "support",
      title: "Support",
      icon: "life",
      sections: [
        { title: "People", items: [{ href: "/admin/inbox", label: "Inbox", icon: "inbox", badge: inbox }, { href: "/admin/partners", label: "Beta partners", icon: "rocket" }, { href: "/admin/feedback", label: "Feedback", icon: "flag", badge: feedback }, { href: "/admin/accounts", label: "Users", icon: "users" }] },
        { title: "Messages", items: [{ href: "/admin/emails", label: "Emails sent", icon: "mail" }] },
      ],
    },
    {
      id: "growth",
      title: "Growth",
      icon: "rocket",
      sections: [
        { title: "Beta access", items: [{ href: "/admin/waitlist", label: "Waitlist", icon: "list", badge: waiting }, { href: "/admin/invites", label: "Invites", icon: "ticket" }] },
        { title: "Product", items: [{ href: "/admin/announcements", label: "Announcements", icon: "mail" }, { href: "/admin/switches", label: "Feature switches", icon: "flag" }] },
      ],
    },
    {
      id: "trust",
      title: "Trust & safety",
      icon: "shield",
      sections: [
        { title: "Review", items: [{ href: "/admin/verification", label: "Verification", icon: "shield", badge: verifying }, { href: "/admin/moderation", label: "Moderation", icon: "flag" }, { href: "/admin/takedowns", label: "Takedowns", icon: "alert", badge: takedowns }, { href: "/admin/blocks", label: "Sender blocks", icon: "shield" }] },
        { title: "Records", items: [{ href: "/admin/privacy", label: "Data requests", icon: "users" }, { href: "/admin/log", label: "Admin log", icon: "log" }] },
      ],
    },
  ];
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
        <AdminNav groups={groups} admin={{ name: admin.name, initials }} />
      </div>
      <AdminMobileNav groups={groups} />
      <div className="min-w-0 flex-1">
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-8 md:py-8">
          {children}
        </main>
      </div>
      <Toast flash={notice} />
    </div>
  );
}
