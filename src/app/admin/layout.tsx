import Link from "next/link";
import { Logo } from "@/components/Logo";
import { adminReady, requireAdmin } from "@/lib/admin";

export const metadata = { title: "Admin — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Overview"],
  ["/admin/metrics", "Metrics"],
  ["/admin/incidents", "Incidents"],
  ["/admin/inbox", "Inbox"],
  ["/admin/accounts", "Accounts"],
  ["/admin/emails", "Emails"],
  ["/admin/waitlist", "Waitlist"],
  ["/admin/invites", "Invites"],
  ["/admin/moderation", "Moderation"],
  ["/admin/log", "Admin log"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="chip border-danger/50 text-danger">Admin</span>
          </div>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-sm text-mute hover:bg-ink-2 hover:text-bone">
                {label}
              </Link>
            ))}
          </nav>
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
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
