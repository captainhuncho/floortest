import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-ops-overview-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// The new Overview, "Waiting on me" (admin redesign B, step 3; switch ops_shell): the headline's figures, the area
// filter and its counts, the fold, and what each role is shown at all.

const H = 3_600_000;
const now = 1_800_000_000_000;
const item = (id: string, area: "support" | "safety" | "growth" | "platform", created: number, dueIn: number) => ({ id, area, created_at: now - created, due_at: now + dueIn });

test("headline: the full count, the oldest by arrival and how many are past due ('or more' once the list is cut)", async () => {
  const { headline } = await import("../src/app/admin/overview/model");
  const items = [item("late-inbox", "support", 5 * H, -2 * H), item("old-privacy", "safety", 20 * 24 * H, 24 * H), item("fresh-job", "platform", 10 * 60_000, 50 * 60_000), item("late-job", "platform", 2 * H, -H)];
  const h = headline(items, 9, now, 50);
  assert.equal(h.total, 9, "the full open count, not just the rows read");
  assert.equal(h.oldest?.id, "old-privacy", "the oldest is the one that arrived first, whatever its due time");
  assert.equal(h.pastDue, 2);
  assert.equal(h.pastMore, false);
  assert.equal(headline(items, 0, now, 4).pastMore, true, "a list at the limit may hide more past-due items");
  assert.equal(headline(items, 0, now, 50).total, 4, "never fewer than the rows shown");
  const empty = headline([], 0, now, 50);
  assert.deepEqual([empty.total, empty.oldest, empty.pastDue], [0, undefined, 0]);
  // Exactly at its due time is not yet late.
  assert.equal(headline([item("due-now", "support", H, 0)], 1, now, 50).pastDue, 0);
});

test("filter: each tab lists its own area, due soonest first; counts cover every tab this person has", async () => {
  const { inArea, areaCounts } = await import("../src/app/admin/overview/model");
  const items = [item("b", "support", H, 3 * H), item("a", "support", 2 * H, H), item("c", "safety", H, 2 * H), item("d", "platform", H, -H), item("e", "support", 3 * H, H)];
  assert.deepEqual(inArea(items, "all").map((i) => i.id), ["d", "e", "a", "c", "b"], "due first, then the one that arrived first");
  assert.deepEqual(inArea(items, "support").map((i) => i.id), ["e", "a", "b"]);
  assert.deepEqual(inArea(items, "growth"), []);
  assert.deepEqual(areaCounts(items, ["support", "safety", "growth", "platform"]), { all: 5, support: 3, safety: 1, growth: 0, platform: 1 });
  // A role without Platform has no Platform tab, and a stray row of it is never counted under one.
  assert.deepEqual(areaCounts(items, ["support", "safety"]), { all: 5, support: 3, safety: 1 });
});

test("fold: six rows until opened, then all; short lists never fold", async () => {
  const { fold, FOLD_AT } = await import("../src/app/admin/overview/model");
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(FOLD_AT, 6);
  assert.deepEqual(fold(ten, false), { shown: [0, 1, 2, 3, 4, 5], hidden: 4 });
  assert.deepEqual(fold(ten, true), { shown: ten, hidden: 0 });
  assert.deepEqual(fold(ten.slice(0, 6), false), { shown: [0, 1, 2, 3, 4, 5], hidden: 0 });
  assert.deepEqual(fold([], false), { shown: [], hidden: 0 });
});

test("times read as words: 'due in' before, 'late' after", async () => {
  const { dueText, things } = await import("../src/app/admin/overview/model");
  assert.equal(dueText(now + 2 * H, now), "due in 2 h");
  assert.equal(dueText(now - 3 * 24 * H, now), "3 d late");
  assert.equal(dueText(now - 5 * 60_000, now), "5 min late");
  assert.equal(things(1), "1 thing is");
  assert.equal(things(1200), "1,200 things are");
});

test("permissions: Customer Care sees its own queues, no Platform items, card or tab, and no revenue; Sales sees revenue", async () => {
  const { q } = await import("../src/lib/db");
  const { recordRun } = await import("../src/lib/cron");
  const { overviewData } = await import("../src/app/admin/overview/data");
  const { ROLE_PERMS, needFor, has } = await import("../src/lib/ops-perms");
  const t = Date.now() - 2 * 86_400_000;
  await q.run("INSERT INTO contact_messages (name, email, topic, message, created_at) VALUES ('Ina', 'ina@ov.io', 'Something else', 'hello', ?)", t);
  await q.run("INSERT INTO incidents (kind, message, created_at) VALUES ('cron_failed', 'Email queue job failed', ?)", t + 1_000);
  await recordRun("mail", Date.now(), false, { error: "down" });
  const paid = await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('p@ov.io', 'h', 'Pay', 'payer', 'pro', 'UTC', ?) RETURNING id", t);
  assert.ok(paid);

  const role = (r: keyof typeof ROLE_PERMS) => {
    const access = { super: false as const, role: r, perms: new Set(ROLE_PERMS[r]) };
    const allowed = (href: string) => {
      const need = needFor(href);
      return need !== "super" && has(access.perms, need);
    };
    return overviewData(access, allowed);
  };
  const revenue = (d: { kpis: { label: string }[] }) => d.kpis.some((k) => k.label === "A month at list price");

  const care = await role("care");
  assert.deepEqual([...new Set(care.rows.map((r) => r.kind))], ["inbox"]);
  assert.ok(!care.rows.some((r) => r.area === "platform"), "no Platform rows");
  assert.ok(!care.areas.includes("platform"), "no Platform tab");
  assert.equal(care.platform, null, "no Platform card");
  assert.ok(!revenue(care), "no revenue");
  assert.ok(!care.kpis.some((k) => k.label === "Waitlist"), "no waitlist for Care");

  const sales = await role("sales");
  assert.ok(revenue(sales), "Sales has Revenue, so the figure shows");
  assert.equal(sales.kpis.find((k) => k.label === "A month at list price")?.note, "1 on paid plans");

  const dev = await role("developer");
  // Kinds read as words, never slugs: the incident's kind and the plan's name.
  assert.equal(dev.rows.find((r) => r.kind === "incident")?.subtitle, "Scheduled job failed");
  const asker = await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('a@ov.io', 'h', 'Ask', 'asker', 'free', 'UTC', ?) RETURNING id", t);
  const plan = await q.get<{ id: string; name: string }>("SELECT id, name FROM plans WHERE id <> 'free' ORDER BY position LIMIT 1");
  await q.run("INSERT INTO plan_requests (user_id, plan, kind, created_at) VALUES (?, ?, 'upgrade', ?)", asker!.id, plan!.id, t);
  assert.equal((await role("sales")).rows.find((r) => r.kind === "plan_request")?.subtitle, `Asks for ${plan!.name}`);
  assert.deepEqual([...new Set(dev.rows.map((r) => r.kind))].sort(), ["incident", "job_failed"]);
  assert.deepEqual(dev.areas, ["platform"]);
  assert.ok(dev.platform, "Developer sees the Platform card");
  assert.equal(dev.platform!.incident?.message, "Email queue job failed");
  assert.equal(dev.platform!.jobs?.failed, 1, "today's failed run, from the job log");
  assert.ok(!revenue(dev));
});

test("incident kinds read as plain words, an unknown one as its slug with spaces", async () => {
  const { incidentKindLabel } = await import("../src/lib/incident-kinds");
  assert.equal(incidentKindLabel("cron_failed"), "Scheduled job failed");
  assert.equal(incidentKindLabel("email_failed"), "Email failed");
  assert.equal(incidentKindLabel("server_error"), "Server error");
  assert.equal(incidentKindLabel("disk_nearly_full"), "disk nearly full");
});
