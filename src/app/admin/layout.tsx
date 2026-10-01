import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { AdminNav, type NavGroup } from "./AdminNav";

export const metadata = { title: "Admin — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";



export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Counts that need attention, shown as badges.
  const [inbox, waiting, incidents, verifying] = [
    await q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL"),
    await q.count("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
    await q.count("SELECT COUNT(*) AS n FROM incidents WHERE created_at >= ?", Date.now() - 86_400_000),
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
            { href: "/admin/metrics", label: "Metrics", icon: "chart" },
            { href: "/admin/incidents", label: "Incidents", icon: "alert", badge: incidents },
          ],
        },
      ],
    },
    {
      id: "support",
      title: "Support",
      icon: "life",
      sections: [
        { title: "People", items: [{ href: "/admin/inbox", label: "Inbox", icon: "inbox", badge: inbox }, { href: "/admin/accounts", label: "Users", icon: "users" }] },
        { title: "Messages", items: [{ href: "/admin/emails", label: "Emails sent", icon: "mail" }] },
      ],
    },
    {
      id: "growth",
      title: "Growth",
      icon: "rocket",
      sections: [{ title: "Beta access", items: [{ href: "/admin/waitlist", label: "Waitlist", icon: "list", badge: waiting }, { href: "/admin/invites", label: "Invites", icon: "ticket" }] }],
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
  const flat = groups.flatMap((g) => g.sections.flatMap((s) => s.items));
  return (
    <div className="min-h-dvh bg-ink md:flex">
      <div className="sticky top-0 hidden h-dvh md:block">
        <AdminNav groups={groups} admin={{ name: admin.name, initials }} />
      </div>
      {/* Phones: a scrolling row of pages instead of the two-part sidebar. */}
      <nav aria-label="Admin" className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-line bg-ink/95 px-3 py-2 font-[family-name:var(--font-stage-mono)] backdrop-blur md:hidden">
        <Link href="/dashboard/floor" className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px] text-faint">
          ← Desk
        </Link>
        {flat.map((i) => (
          <Link key={i.href} href={i.href} className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px] text-mute hover:bg-ink-3 hover:text-bone">
            {i.label}
            {!!i.badge && <span className="ml-1 rounded bg-lime px-1 text-[9px] font-bold text-ink">{i.badge}</span>}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 font-[family-name:var(--font-stage-mono)] sm:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
