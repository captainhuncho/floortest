import { PlayerBar, PlayerProvider } from "@/components/Player";
import { ToastProvider } from "@/components/Toast";
import { requireUser } from "@/lib/auth";
import { activeCollection, capacity, collectionsFor, isClosed, isPaused, purgeExpired } from "@/lib/core";
import { APP_URL } from "@/lib/mail";
import { notificationsFor } from "@/lib/notifications";
import { PLANS, planOf } from "@/lib/plans";
import { footerLinks, VERSION } from "@/lib/site";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  purgeExpired();
  const collections = collectionsFor(user.id);
  const cap = capacity(user);
  const plan = planOf(user.plan);
  const upgrade = Object.values(PLANS).find((p) => p.limit > plan.limit) ?? null;
  const since = new Date(user.created_at);
  const memberSince = `${String(since.getDate()).padStart(2, "0")}.${String(since.getMonth() + 1).padStart(2, "0")}.${since.getFullYear()}`;
  const link = `${APP_URL}/${user.handle}`;

  return (
    <PlayerProvider>
      <ToastProvider>
        <div className="md:grid md:h-dvh md:grid-cols-[248px_1fr]">
          <Sidebar
            user={{ handle: user.handle, name: user.name }}
            link={link}
            collections={collections.map((c) => ({ id: c.id, name: c.name }))}
            activeId={user.active_collection_id}
            needsReview={collections.reduce((n, c) => n + c.needs_review, 0)}
            cap={cap}
            plan={{ name: plan.name, upgrade: upgrade && { name: upgrade.name, limit: upgrade.limit } }}
            pause={{
                  on: isPaused(user),
                  until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null,
                  untilTs: user.pause_until,
                  // Even with the switch on, uploads stop if the routed collection closed or the desk is full.
                  blocked: (() => {
                    const c = activeCollection(user);
                    if (!c) return "No collection selected";
                    if (isClosed(c)) return `But “${c.name}” is closed, so uploads are still off`;
                    if (cap.full) return "But your desk is full, so uploads are still off";
                    return null;
                  })(),
                  message: user.pause_message,
                }}
          />
          <main id="main" className="min-w-0 pb-24 md:overflow-y-auto">
            <div className="sticky top-0 z-40 flex h-[68px] items-center justify-end border-b border-line bg-ink/85 px-4 backdrop-blur sm:px-6">
              <TopBar
                user={{ name: user.name, email: user.email, handle: user.handle, plan: plan.name, memberSince }}
                link={link}
                notices={notificationsFor(user)}
                footer={footerLinks()}
                version={VERSION}
              />
            </div>
            {children}
          </main>
        </div>
        <PlayerBar />
      </ToastProvider>
    </PlayerProvider>
  );
}
