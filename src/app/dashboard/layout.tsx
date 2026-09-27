import { after } from "next/server";
import { PlayerBar, PlayerProvider } from "@/components/Player";
import { ToastProvider } from "@/components/Toast";
import { requireUser } from "@/lib/auth";
import { activeCollection, capacity, collectionsFor, isClosed, isPaused, purgeExpired } from "@/lib/core";
import { APP_URL } from "@/lib/mail";
import { notificationsFor } from "@/lib/notifications";
import { PLANS, planOf } from "@/lib/plans";
import { footerLinks, VERSION } from "@/lib/site";
import { Sidebar } from "./Sidebar";
import { LinkPill } from "./LinkPill";
import { TopBar } from "./TopBar";
import { VerifyBanner } from "./VerifyBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Retention cleanup runs after the response, so it never slows a page down.
  after(() => purgeExpired().catch((e) => console.error("[purge]", e)));
  const [collections, cap, active, notices] = await Promise.all([collectionsFor(user.id), capacity(user), activeCollection(user), notificationsFor(user)]);
  // Even with the switch on, uploads stop if the routed collection closed or the desk is full.
  const blocked = !active
    ? "No collection selected"
    : isClosed(active)
      ? `But “${active.name}” is closed, so uploads are still off`
      : cap.full
        ? "But your desk is full, so uploads are still off"
        : null;
  const plan = planOf(user.plan);
  const upgrade = Object.values(PLANS).find((p) => p.limit > plan.limit) ?? null;
  const memberSince = new Date(user.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: user.tz }).replaceAll("/", ".");
  const link = `${APP_URL}/${user.handle}`;

  return (
    <PlayerProvider>
      <ToastProvider>
        <div className="md:grid md:h-dvh md:grid-cols-[248px_1fr]">
          <Sidebar
            user={{ handle: user.handle, name: user.name }}
            link={link}
            collections={collections.map((c) => ({ id: c.id, name: c.name, closed: isClosed(c) }))}
            activeId={user.active_collection_id}
            needsReview={collections.reduce((n, c) => n + c.needs_review, 0)}
            cap={cap}
            plan={{ name: plan.name, upgrade: upgrade && { name: upgrade.name, limit: upgrade.limit } }}
            pause={{
              on: isPaused(user),
              until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.tz }) : null,
              untilTs: user.pause_until,
              blocked,
              message: user.pause_message,
            }}
          />
          <main id="main" className="min-w-0 pb-24 md:overflow-y-auto">
            <div className="sticky top-0 z-40 flex h-[68px] items-center justify-end gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur sm:px-6">
              <LinkPill link={link} />
              <TopBar
                user={{ name: user.name, email: user.email, handle: user.handle, plan: plan.name, memberSince }}
                link={link}
                notices={notices}
                footer={footerLinks()}
                version={VERSION}
              />
            </div>
            {!user.email_verified_at && <VerifyBanner email={user.email} />}
            {children}
          </main>
        </div>
        <PlayerBar />
      </ToastProvider>
    </PlayerProvider>
  );
}
