import Link from "next/link";
import { Logo } from "@/components/Logo";
import { adminReady, requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { AdminNav, type NavGroup } from "./AdminNav";

export const metadata = { title: "Admin — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";



export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Counts that need attention, shown as badges.
  const [inbox, waiting, incidents] = [
    await q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL"),
    await q.count("SELECT COUNT(*) AS n FROM waitlist WHERE invited_at IS NULL"),
    await q.count("SELECT COUNT(*) AS n FROM incidents WHERE created_at >= ?", Date.now() - 86_400_000),
  ];
  const groups: NavGroup[] = [
    { title: "Monitor", items: [{ href: "/admin", label: "Overview" }, { href: "/admin/metrics", label: "Metrics" }, { href: "/admin/incidents", label: "Incidents", badge: incidents }] },
    { title: "Support", items: [{ href: "/admin/inbox", label: "Inbox", badge: inbox }, { href: "/admin/accounts", label: "Accounts" }, { href: "/admin/emails", label: "Emails" }] },
    { title: "Growth", items: [{ href: "/admin/waitlist", label: "Waitlist", badge: waiting }, { href: "/admin/invites", label: "Invites" }] },
    { title: "Trust & safety", items: [{ href: "/admin/moderation", label: "Moderation" }, { href: "/admin/log", label: "Admin log" }] },
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="chip border-danger/50 text-danger">Admin</span>
          </div>

          <Link href="/dashboard/floor" className="ml-auto text-sm text-mute hover:text-bone">
            Back to my desk →
          </Link>
        </div>
      </header>
      {!adminReady(admin) && (
        <p role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          Admin actions are locked until you turn on two-factor sign-in in{" "}
          <Link href="/dashboard/settings#security-h" className="underline">
            Settings
          </Link>
          . You can look around, but not change anything.
        </p>
      )}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[190px_minmax(0,1fr)] md:gap-10 md:py-8">
        <aside className="md:sticky md:top-20 md:self-start">
          <AdminNav groups={groups} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
