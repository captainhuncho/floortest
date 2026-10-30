import { after } from "next/server";
import { PlayerBar, PlayerProvider } from "@/components/Player";
import { LivePulse } from "@/components/LivePulse";
import { ToastProvider } from "@/components/Toast";
import { requireUser, viewingAs, currentPerson } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { activeCollectionForView, capacityForView, collectionsForView, isClosed, isPaused } from "@/lib/desk";
import { purgeExpired } from "@/lib/retention";
import { notificationsFor } from "@/lib/notifications";
import { Logo } from "@/components/Logo";
import { Sidebar } from "./Sidebar";
import { FeedbackButton } from "./FeedbackButton";
import { MobileTabBar } from "./MobileTabBar";
import { TopBar } from "./TopBar";
import { DeskBar } from "./DeskBar";
import { PageFrame } from "./PageFrame";
import { teamsFor } from "@/lib/account-members";
import { currentTheme, themeClass } from "@/lib/theme";
import { SkipLink } from "@/components/SkipLink";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, view, theme] = await Promise.all([requireUser(), viewingAs(), currentTheme()]);
  // Retention cleanup runs after the response, so it never slows a page down.
  after(() => purgeExpired().catch((e) => console.error("[purge]", e)));
  const [collections, cap, active, notices, teams, me] = await Promise.all([
    collectionsForView(user.id),
    capacityForView(user.id, user.plan),
    activeCollectionForView(user.active_collection_id),
    notificationsFor(user),
    view ? Promise.resolve([]) : teamsFor(user.actor_id),
    currentPerson(),
  ]);
  // Even with the switch on, uploads stop if the routed collection closed or the desk is full. With no collection the
  // link stays open and tracks land in the Review Queue, unsorted.
  const blocked = active && isClosed(active)
      ? `But “${active.name}” is closed, so uploads are still off`
      : cap.full
        ? "But your desk is full, so uploads are still off"
        : null;
  const pauseState = {
              on: isPaused(user),
              until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.tz }) : null,
              untilTs: user.pause_until,
              blocked,
              message: user.pause_message,
            };

  return (
    <div id="theme-root" className={themeClass(theme)}>
    <SkipLink />
    <PlayerProvider>
      <ToastProvider>
        <div className="md:grid md:h-dvh md:grid-cols-[248px_1fr]">
          <Sidebar
            needsReview={collections.reduce((n, c) => n + c.needs_review, 0)}
            cap={cap}
            pause={pauseState}
            canSend={user.role !== "member" && (await switchOn("send_music", user))}
          />
          <main id="main" className="min-w-0 pb-48 md:overflow-y-auto md:pb-24">
            {/* Phones: the logo floats on top in a frosted bar, always in view (owner, 30 Oct); desktop keeps the slim bar. */}
            <div className="sticky top-0 z-40 bg-gradient-to-b from-ink from-60% to-transparent px-3 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:bg-none md:p-0">
              <div className="flex h-14 items-center justify-end gap-2 rounded-[20px] border border-line bg-ink-2/80 pl-3 pr-1.5 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150 sm:gap-3 md:h-14 md:rounded-none md:border-0 md:bg-ink/70 md:px-6 md:shadow-none">
                <Logo href="/" className="mr-auto md:hidden" />
                <span className="mr-auto hidden md:block" />
                <div className="hidden md:block">
                  <FeedbackButton />
                </div>
                <TopBar user={{ name: user.name, handle: user.handle, verified: user.identity_status === "verified" }} notices={notices} />
              </div>
            </div>
            {view && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/50 bg-danger/15 px-4 py-2.5 text-sm sm:px-6">
                <span>
                  <span className="font-semibold text-danger">Admin view</span> · You&apos;re seeing @{view.handle}&apos;s desk. Read-only: changes are blocked.
                </span>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a route handler that ends the admin view, so a full navigation */}
                <a href="/dashboard/exit-view" className="font-medium text-danger underline underline-offset-4">
                  Exit view
                </a>
              </div>
            )}
            {/* Account teams: which desk this is, and switching between yours and your teams'. */}
            {!view && me && (teams.length > 0 || user.actor_id !== user.id) && (
              <DeskBar
                current={{ id: user.id, name: user.name, role: user.role }}
                own={{ id: me.id, name: me.name, role: "owner" }}
                teams={teams.map((t) => ({ id: t.id, name: t.name, role: t.role }))}
              />
            )}
            {/* The confirm-your-email banner lives on the Floor and Send pages only (they render VerifyBanner). */}
            <PageFrame>{children}</PageFrame>
            {!view && <LivePulse url="/api/pulse" />}
          </main>
        </div>
        <PlayerBar />
        <MobileTabBar needsReview={collections.reduce((n, c) => n + c.needs_review, 0)} />
      </ToastProvider>
    </PlayerProvider>
    </div>
  );
}
