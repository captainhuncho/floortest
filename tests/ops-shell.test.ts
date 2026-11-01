import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret, set before the app's modules load (ops-waiting reads its kinds' areas from it).
process.env.DATA_DIR = testDataDir("ft-ops-shell-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// The new ops shell's navigation model (admin redesign B, step 2): which areas and pages each person gets, and where
// Waiting on me's counts land.

const load = async () => {
  const model = await import("../src/app/admin/shell/model");
  const { has, needFor, ROLE_PERMS } = await import("../src/lib/ops-perms");
  const everyone = () => true;
  const role = (r: keyof typeof ROLE_PERMS) => {
    const perms = new Set(ROLE_PERMS[r]);
    return (href: string) => {
      const need = needFor(href);
      return need !== "super" && has(perms, need);
    };
  };
  return { ...model, everyone, role };
};

test("the super admin gets every area in the rail's order, each starting at its first page", async () => {
  const { shellAreas, everyone } = await load();
  const areas = shellAreas(everyone, {});
  assert.deepEqual(
    areas.map((a) => a.title),
    ["Overview", "Support", "Trust & safety", "Growth", "Product", "Platform", "Admin"],
  );
  assert.equal(areas.find((a) => a.id === "support")!.href, "/admin/inbox");
  assert.equal(areas.find((a) => a.id === "overview")!.href, "/admin");
  assert.ok(areas.every((a) => a.waiting === 0), "nothing waiting, no badges");
});

test("Customer Care sees Support and Trust & safety pages it may open, and no Platform, Admin, Growth or Product", async () => {
  const { shellAreas, role } = await load();
  const areas = shellAreas(role("care"), { inbox: 2, incident: 4, takedown: 1 });
  assert.deepEqual(
    areas.map((a) => a.id),
    ["overview", "support", "trust"],
    "areas with no page this role can open drop out",
  );
  const trust = areas.find((a) => a.id === "trust")!;
  assert.deepEqual(trust.sections.flatMap((s) => s.items.map((i) => i.href)), ["/admin/verification"], "Takedowns, Moderation and the rest are not Care's");
  assert.equal(areas.find((a) => a.id === "support")!.waiting, 2);
  assert.ok(!areas.some((a) => a.sections.some((s) => s.items.some((i) => i.href === "/admin/incidents"))), "an incident count never shows a page Care can't open");
});

test("Waiting on me's counts land on their pages and add up per area; quiet counts never add to the badge", async () => {
  const { shellAreas, everyone } = await load();
  const areas = shellAreas(everyone, { inbox: 3, privacy: 1, verification: 2, verification_proposal: 1, takedown: 1, plan_request: 4, incident: 2, job_failed: 1 }, { "/admin/feedback": 7, "/admin/waitlist": 12 });
  const page = (href: string) => areas.flatMap((a) => a.sections.flatMap((s) => s.items)).find((i) => i.href === href)!;
  const area = (id: string) => areas.find((a) => a.id === id)!.waiting;
  assert.deepEqual(page("/admin/verification"), { href: "/admin/verification", label: "Verification", icon: "shield", count: 3, hot: true }, "requests and proposals together");
  assert.equal(area("support"), 3, "inbox only; feedback is a quiet count");
  assert.deepEqual([page("/admin/feedback").count, page("/admin/feedback").hot], [7, false]);
  assert.equal(area("trust"), 5, "privacy 1 + verification 3 + takedown 1");
  assert.equal(area("growth"), 4, "plan requests; the waitlist is quiet");
  assert.equal(area("platform"), 3, "incidents 2 + failed job 1");
  assert.equal(area("product") + area("admin") + area("overview"), 0);
});

test("every waiting kind has a page in the menu, in the same area Waiting on me puts it", async () => {
  const { KIND_PAGE, WAITING_AREA, ALL_PAGES } = await load();
  const { KIND_AREA } = await import("../src/lib/ops-waiting");
  for (const [kind, href] of Object.entries(KIND_PAGE)) {
    const page = ALL_PAGES.find((p) => p.href === href);
    assert.ok(page, `${kind}: ${href} is in the menu`);
    assert.equal(page.area, WAITING_AREA[KIND_AREA[kind as keyof typeof KIND_AREA]], `${kind} sits in the same area`);
  }
});

test("today's navigation keeps its order, ids, titles and badges (switch off)", async () => {
  const { legacyGroups, everyone, role } = await load();
  const groups = legacyGroups(everyone, { "/admin/inbox": 2, "/admin/waitlist": 0 });
  assert.deepEqual(
    groups.map((g) => [g.id, g.title]),
    [["overview", ""], ["support", "Support"], ["growth", "Growth"], ["product", "Product"], ["trust", "Trust & safety"], ["monitor", "Platform"], ["admin", "Admin"]],
  );
  const inbox = groups[1].sections[0].items[0];
  assert.deepEqual(inbox, { href: "/admin/inbox", label: "Inbox", icon: "inbox", badge: 2 });
  assert.equal("badge" in groups[1].sections[0].items[1], false, "pages without a count carry no badge");
  assert.deepEqual(
    legacyGroups(role("care"), {}).map((g) => g.id),
    ["overview", "support", "trust"],
  );
});

test("the current page and area come from the path; sub-pages count, unknown pages fall back to Overview", async () => {
  const { shellAreas, locate, everyone } = await load();
  const areas = shellAreas(everyone, {});
  const at = (path: string) => {
    const { area, page } = locate(areas, path);
    return [area?.id, page?.label];
  };
  assert.deepEqual(at("/admin"), ["overview", "Overview"]);
  assert.deepEqual(at("/admin/accounts/42"), ["support", "Users"]);
  assert.deepEqual(at("/admin/plan-requests"), ["growth", "Plan requests"]);
  assert.deepEqual(at("/admin/plans"), ["growth", "Plans & prices"], "not mistaken for plan-requests");
  assert.deepEqual(at("/admin/no-access"), ["overview", undefined]);
});

test("Next due and the late count come from the sorted list, per area and overall", async () => {
  const { nextAndLate, dueWords } = await import("../src/app/admin/shell/data");
  const now = 10 * 3_600_000;
  const item = (kind: "inbox" | "takedown", area: "support" | "safety", due: number) => ({ kind, area, id: "1", title: `${kind} ${due}`, subtitle: "s", created_at: due - 3 * 3_600_000, due_at: due, need: "super" as const, href: `/admin/${kind}` });
  const { next, late } = nextAndLate([item("takedown", "safety", now - 7_200_000), item("inbox", "support", now - 60_000), item("inbox", "support", now + 3_600_000)], now);
  assert.equal(next.overview!.title, `takedown ${now - 7_200_000}`);
  assert.deepEqual(next.trust, { title: `takedown ${now - 7_200_000}`, subtitle: "s", href: "/admin/takedown", when: "2 h late", late: true });
  assert.equal(next.support!.when, "1 min late");
  assert.deepEqual(late, { overview: 2, trust: 1, support: 1 });
  assert.equal(dueWords(now + 3 * 3_600_000, now), "Due in 3 h");
  assert.equal(dueWords(now - 3 * 86_400_000, now), "3 d late");
});
