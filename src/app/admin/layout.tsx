import { can, requireAdmin } from "@/lib/admin";
import { needFor, ROLES } from "@/lib/ops-perms";
import { q } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { switchOn } from "@/lib/switches";
import { currentTheme, themeClass } from "@/lib/theme";
import "./admin.css";
import { AdminNav, AdminTopNav, type NavGroup } from "./AdminNav";
import { Toast } from "./AdminUi";
import { AdminMobileNav } from "./AdminMobileNav";
import { SkipLink } from "@/components/SkipLink";
import { AdminMotion } from "./AdminMotion";
import "./kit/kit.css";
import { KeysProvider } from "./kit/Keys";
import { Palette, type PaletteEntry } from "./kit/Palette";
import { legacyGroups } from "./shell/model";
import { shellData } from "./shell/data";
import { OpsShell } from "./shell/OpsShell";

export const metadata = { title: "Admin — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Today's badge counts, only for what this person can open, all at once (the navigation with ops_shell off). */
async function legacyBadges(allowed: (href: string) => boolean) {
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
  return {
    "/admin/inbox": inbox,
    "/admin/feedback": feedback,
    "/admin/waitlist": waiting,
    "/admin/plan-requests": planAsks,
    "/admin/verification": verifying,
    "/admin/takedowns": takedowns,
    "/admin/incidents": incidents,
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const access = admin.access;
  const allowed = (href: string) => can(access, needFor(href));
  // The new shell (admin redesign B) or today's navigation, never both: one switch, read once per request.
  const shell = await switchOn("ops_shell");
  // Grouped by the question being asked; Overview sits on its own at the top, the admin tools at the bottom (shell/model.ts).
  // Each person sees only what they can open; empty sections and groups drop out.
  const groups: NavGroup[] = legacyGroups(allowed, shell ? {} : await legacyBadges(allowed));
  const roleLabel = access.super ? "Super admin" : ROLES[access.role];
  const initials = admin.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const me = { name: admin.name, initials, role: roleLabel };
  const notice = await readFlash();
  // ⌘K: the pages this person can open (the same filtered list as the menu) and the kit's own actions.
  const paletteEntries: PaletteEntry[] = [
    ...groups.flatMap((g) => g.sections.flatMap((sec) => sec.items.map((i) => ({ id: i.href, label: i.label, href: i.href, group: "Pages" as const, hint: g.title || undefined, keywords: [g.title, sec.title].filter(Boolean) })))),
    { id: "keys", label: "Keyboard shortcuts", group: "Actions", hint: "?", keywords: ["help", "keys"] },
  ];
  const theme = themeClass(await currentTheme());
  const extras = (
    <>
      <Toast flash={notice} />
      <Palette entries={paletteEntries} canPeople={can(access, "users.read")} />
    </>
  );
  if (shell) {
    return (
      <div id="theme-root" className={theme}>
        <KeysProvider>
          <AdminMotion />
          <SkipLink />
          <OpsShell data={await shellData(access, allowed)} me={me}>
            {children}
          </OpsShell>
          {extras}
        </KeysProvider>
      </div>
    );
  }
  return (
    <div id="theme-root" className={`${theme} md:flex`}>
      <KeysProvider>
      <AdminMotion />
      <SkipLink />
      <div className="sticky top-0 hidden h-dvh md:block">
        <AdminNav groups={groups} admin={me} />
      </div>
      <AdminMobileNav groups={groups} />
      <div className="admin-canvas min-w-0 flex-1">
        <AdminTopNav groups={groups} />
        <main id="main" className="mx-auto max-w-[1240px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 md:py-8">
          {children}
        </main>
      </div>
      {extras}
      </KeysProvider>
    </div>
  );
}
