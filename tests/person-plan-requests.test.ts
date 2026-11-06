import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-plan-requests-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// The writes requestPlan and withdrawPlanRequest make (src/app/dashboard/actions/settings.ts), as the person.
const FILE = "INSERT INTO plan_requests (user_id, plan, kind, org, link, volume, note) VALUES (?,?,?,?,?,?,?)";
const WITHDRAW = "UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ? AND status = 'pending'";

async function people() {
  const { q } = await import("../src/lib/db");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?) RETURNING id",
      `${handle}@plans.io`, handle, handle, now, now,
    ))!.id;
  return { now, user };
}

test("the owner files, sees and withdraws their own desk's request as the person", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { pendingRequest } = await import("../src/lib/plan-requests");
  const { now, user } = await people();
  const me = await user("ownerplan");
  await asPerson(me, () => q.run(FILE, me, "pro", "artist", "", "", "", ""));
  assert.equal((await pendingRequest(me, me))?.plan, "pro", "the owner sees it as the person");
  assert.equal((await asPerson(me, () => q.run(WITHDRAW, me))).changes, 1);
  assert.equal(await pendingRequest(me, me), undefined);
  assert.equal((await q.get<{ status: string }>("SELECT status FROM plan_requests WHERE user_id = ?", me))!.status, "withdrawn");
});

test("nobody else sees, files or withdraws a desk's request, a teammate included", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { pendingRequest } = await import("../src/lib/plan-requests");
  const { now, user } = await people();
  const label = await user("labelplan");
  const admin = await user("adminplan");
  const stranger = await user("strangerplan");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", label, admin, now);
  await asPerson(label, () => q.run(FILE, label, "team", "label", "Label Ltd", "https://label.example", "", ""));
  for (const who of [admin, stranger]) {
    assert.equal(await pendingRequest(label, who), undefined, `person ${who} doesn't see the label's request`);
    assert.equal((await asPerson(who, () => q.run(WITHDRAW, label))).changes, 0, `person ${who} can't withdraw it`);
    await assert.rejects(asPerson(who, () => q.run(FILE, label, "team", "label", "", "", "", "")), /row-level security|policy/i, `person ${who} can't file for the label`);
  }
  assert.equal((await pendingRequest(label))?.plan, "team", "still waiting");
});

test("as the person, a request can't be filed or changed into a decision, and ops' fields stay unreadable", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { now, user } = await people();
  const me = await user("sneakyplan");
  // Filing one already approved, or with a granted plan, is refused outright.
  await assert.rejects(asPerson(me, () => q.run("INSERT INTO plan_requests (user_id, plan, kind, status, created_at) VALUES (?, 'team', 'artist', 'approved', ?)", me, now)), /permission denied/i);
  await assert.rejects(asPerson(me, () => q.run("INSERT INTO plan_requests (user_id, plan, kind, granted_plan, created_at) VALUES (?, 'team', 'artist', 'team', ?)", me, now)), /permission denied/i);
  await asPerson(me, () => q.run(FILE, me, "pro", "artist", "", "", "", ""));
  // Approving your own, or touching the decision, is refused.
  await assert.rejects(asPerson(me, () => q.run("UPDATE plan_requests SET status = 'approved' WHERE user_id = ?", me)), /row-level security|policy/i);
  for (const col of ["granted_plan", "decided_by", "decided_at", "decision_note", "plan"])
    await assert.rejects(asPerson(me, () => q.run(`UPDATE plan_requests SET ${col} = NULL WHERE user_id = ?`, me)), /permission denied/i, `${col} isn't the person's to change`);
  // Reading more than the plan pages show is refused.
  for (const col of ["org", "link", "note", "decision_note", "granted_plan"])
    await assert.rejects(asPerson(me, () => q.get(`SELECT ${col} FROM plan_requests WHERE user_id = ?`, me)), /permission denied/i, `${col} isn't readable as the person`);
  // A request that's no longer waiting can't be touched.
  await q.run("UPDATE plan_requests SET status = 'declined' WHERE user_id = ?", me);
  assert.equal((await asPerson(me, () => q.run("UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ?", me))).changes, 0);
  assert.equal((await q.get<{ status: string }>("SELECT status FROM plan_requests WHERE user_id = ?", me))!.status, "declined");
});

test("the plan pages and actions read and write requests as the person, and roles are unchanged", () => {
  const actions = fs.readFileSync("src/app/dashboard/actions/settings.ts", "utf8");
  const body = (name: string) => {
    const start = actions.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    const next = actions.indexOf("\nexport ", start + 1);
    return actions.slice(start, next < 0 ? undefined : next);
  };
  assert.match(body("requestPlan"), /requireRole\("owner"\)/);
  assert.match(body("requestPlan"), /asPerson\(u\.actor_id, \(\) =>\s*q\.tx\(async \(db\) => \{\s*await db\.run\("UPDATE plan_requests/);
  assert.match(body("requestPlan"), /err\?\.code === "23505" && \(err\.constraint_name \?\? err\.constraint\) === "plan_requests_one_pending"\) redirect\("\/dashboard\/plans\?requested=1"\)/, "only the one-pending race lands as already requested");
  assert.doesNotMatch(body("requestPlan"), /INSERT INTO plan_requests \([^)]*created_at/, "the database stamps the time");
  assert.match(body("withdrawPlanRequest"), /requireRole\("owner"\)/);
  assert.match(body("withdrawPlanRequest"), /pendingRequest\(u\.id, u\.actor_id\)/);
  assert.match(body("withdrawPlanRequest"), /asPerson\(u\.actor_id, \(\) => q\.run\("UPDATE plan_requests/);
  for (const page of ["src/app/dashboard/plans/page.tsx", "src/app/dashboard/plans/request/page.tsx"])
    assert.match(fs.readFileSync(page, "utf8"), /pendingRequest\(user\.id, user\.actor_id\)/, `${page} reads as the person`);
  assert.doesNotMatch(fs.readFileSync("src/lib/plan-requests.ts", "utf8"), /SELECT \*/, "named columns only");
});

test("a request's time is the database's for the person: a sent time is ignored, so it can't be back-dated, and older code still works", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { user } = await people();
  const me = await user("timeplan");
  const before = Date.now();
  // The build before this one sends created_at as the person: still allowed, and the database's time wins.
  await asPerson(me, () => q.run("INSERT INTO plan_requests (user_id, plan, kind, created_at) VALUES (?, 'pro', 'artist', 1)", me));
  const t = (await q.get<{ t: number }>("SELECT created_at AS t FROM plan_requests WHERE user_id = ?", me))!.t;
  assert.ok(t >= before - 1000 && t <= Date.now() + 1000, `stamped now, not 1: ${t}`);
  // The app's own connection (seeds, tests, restores) may still set a time; left out, the database stamps it.
  await q.run("UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ?", me);
  await q.run("INSERT INTO plan_requests (user_id, plan, kind, created_at) VALUES (?, 'pro', 'artist', 5)", me);
  assert.equal((await q.get<{ t: number }>("SELECT min(created_at) AS t FROM plan_requests WHERE user_id = ?", me))!.t, 5);
  await q.run("UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ?", me);
  await q.run("INSERT INTO plan_requests (user_id, plan, kind) VALUES (?, 'pro', 'artist')", me);
  assert.ok((await q.get<{ t: number }>("SELECT max(created_at) AS t FROM plan_requests WHERE user_id = ?", me))!.t > 1_000_000_000_000);
});

test("a second waiting request is refused by the one-pending rule, and the error names it", async () => {
  const { q } = await import("../src/lib/db");
  const { user } = await people();
  const me = await user("dupeplan");
  await q.run("INSERT INTO plan_requests (user_id, plan, kind) VALUES (?, 'pro', 'artist')", me);
  const err = await q.run("INSERT INTO plan_requests (user_id, plan, kind) VALUES (?, 'pro', 'artist')", me).then(() => null, (e) => e as { code?: string; constraint_name?: string; constraint?: string });
  assert.equal(err?.code, "23505");
  assert.equal(err?.constraint_name ?? err?.constraint, "plan_requests_one_pending");
});

test("withdrawing and filing again happen together, so a quick second submit leaves one waiting request", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { user } = await people();
  const me = await user("twiceplan");
  const file = () =>
    asPerson(me, () =>
      q.tx(async (db) => {
        await db.run("UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ? AND status = 'pending'", me);
        await db.run(FILE, me, "pro", "artist", "", "", "", "");
      }),
    );
  await file();
  await file();
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM plan_requests WHERE user_id = ? AND status = 'pending'", me))!.n, 1);
});

test("ops approve or decline a request only while it's still waiting", () => {
  const src = fs.readFileSync("src/app/admin/actions.ts", "utf8");
  assert.match(src, /UPDATE plan_requests SET status = 'approved'[^"]*WHERE id = \? AND status = 'pending' RETURNING id/);
  assert.match(src, /if \(took\) await db\.run\("UPDATE users SET plan = \?/, "the plan changes only with the approval");
  assert.match(src, /UPDATE plan_requests SET status = 'declined'[^"]*WHERE id = \? AND status = 'pending'"/);
  assert.match(src, /if \(!declined\.changes\) return no\(/);
});

test("the time is stamped by the exact person role, not by membership: the app's own login must be a member to switch into it", async () => {
  const { q } = await import("../src/lib/db");
  // pg_has_role(current_user, 'ft_person', 'MEMBER') is true for the app's own login (it must be a member to SET ROLE, and
  // a superuser is a member of every role), so keying on membership would also overwrite times the app sets on purpose
  // (seeds, ops' queue order, restores). The person always writes as ft_person itself (asPerson sets the role).
  const fn = await q.get<{ src: string }>("SELECT prosrc AS src FROM pg_proc WHERE proname = 'ft_stamp_created_at'");
  assert.match(fn!.src, /current_user = 'ft_person'/);
  assert.equal((await q.get<{ ok: boolean }>("SELECT pg_has_role(current_user, 'ft_person', 'MEMBER') AS ok"))!.ok, true, "the app's login is a member");
});
