import { after } from "next/server";
import { PlayerBar, PlayerProvider } from "@/components/Player";
import { ToastProvider } from "@/components/Toast";
import { requireUser, viewingAs } from "@/lib/auth";
import { activeCollection, capacity, collectionsFor, isClosed, isPaused, purgeExpired } from "@/lib/core";
import { APP_URL } from "@/lib/mail";
import { notificationsFor } from "@/lib/notifications";
import { PLANS, planOf } from "@/lib/plans";
import { footerLinks, VERSION } from "@/lib/site";
import { Logo } from "@/components/Logo";
import { Sidebar } from "./Sidebar";
import { FeedbackButton } from "./FeedbackButton";
import { LinkPill } from "./LinkPill";
import { MobileTabBar } from "./MobileTabBar";
import { TopBar } from "./TopBar";
import { VerifyBanner } from "./VerifyBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const view = await viewingAs();
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
  const pauseState = {
              on: isPaused(user),
              until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.tz }) : null,
              untilTs: user.pause_until,
              blocked,
              message: user.pause_message,
            };

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
            pause={pauseState}
          />
          <main id="main" className="min-w-0 pb-48 md:overflow-y-auto md:pb-24">
            <div className="sticky top-0 z-40 flex h-[68px] items-center justify-end gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur sm:px-6">
              <Logo href="/dashboard/floor" className="mr-auto md:hidden" />
              <div className="mr-auto hidden md:block">
                <LinkPill link={link} />
              </div>
              <div className="hidden md:block">
                <FeedbackButton />
              </div>
              <TopBar
                user={{ name: user.name, email: user.email, handle: user.handle, plan: plan.name, memberSince }}
                link={link}
                notices={notices}
                footer={footerLinks()}
                version={VERSION}
                pause={pauseState}
              />
            </div>
            {view && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/50 bg-danger/15 px-4 py-2.5 text-sm sm:px-6">
                <span>
                  <span className="font-semibold text-danger">Admin view</span> · You&apos;re seeing @{view.handle}&apos;s desk. Read-only: changes are blocked.
                </span>
                <a href="/dashboard/exit-view" className="font-medium text-danger underline underline-offset-4">
                  Exit view
                </a>
              </div>
            )}
            {!view && !user.email_verified_at && <VerifyBanner email={user.email} />}
            {children}
          </main>
        </div>
        <PlayerBar />
        <MobileTabBar needsReview={collections.reduce((n, c) => n + c.needs_review, 0)} />
      </ToastProvider>
    </PlayerProvider>
  );
}
