/**
 * Ops access rules, tested against a throwaway copy of the database (never production):
 *   cp -R data /tmp/x && DATA_DIR=/tmp/x/data npx tsx scripts/migrate.ts
 *   ADMIN_EMAILS=boss@rbac.test DATA_DIR=/tmp/x/data npx tsx --conditions=react-server scripts/test-ops-access.ts
 */
import { q, now } from "@/lib/db";
import { can, homeFor, opsAccessFor } from "@/lib/ops-access";
import { needFor, ROLE_PERMS, type Need } from "@/lib/ops-perms";
let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log("FAIL", msg); } };
(async () => {
  await q.run("DELETE FROM users WHERE email LIKE '%@rbac.test'");
  const mk = async (email: string) => (await q.get<{ id: number }>(
    "INSERT INTO users (email, name, handle, password_hash, created_at, email_verified_at) VALUES (?,?,?,?,?,?) RETURNING id",
    email, email.split("@")[0], email.split("@")[0].replace(/[^a-z0-9]/g, "") + Math.floor(Math.random()*1e6), "x", now(), now()))!.id;
  const boss = await mk("boss@rbac.test");
  const care = await mk("care@rbac.test");
  const dev = await mk("dev@rbac.test");
  const gone = await mk("gone@rbac.test");
  const nobody = await mk("nobody@rbac.test");
  const tweaked = await mk("tweak@rbac.test");
  const ins = (id: number, role: string, grant = "", deny = "", disabled: number | null = null) =>
    q.run("INSERT INTO ops_members (user_id, role, grant_perms, deny_perms, created_at, disabled_at) VALUES (?,?,?,?,?,?)", id, role, grant, deny, now(), disabled);
  await ins(care, "care"); await ins(dev, "developer"); await ins(gone, "sales", "", "", now());
  await ins(tweaked, "care", "jobs,security", "inbox.act");

  const A = async (id: number, email: string) => opsAccessFor({ id, email });
  const sup = await A(boss, "boss@rbac.test");
  ok(!!sup?.super, "ADMIN_EMAILS is super");
  ok(!(await A(nobody, "nobody@rbac.test")), "non-member gets nothing");
  ok(!(await A(gone, "gone@rbac.test")), "disabled member gets nothing");
  const c = (await A(care, "care@rbac.test"))!;
  const d = (await A(dev, "dev@rbac.test"))!;
  const t = (await A(tweaked, "tweak@rbac.test"))!;
  // Super-only stays super-only for every role, whatever is ticked.
  for (const path of ["/admin/takedowns", "/admin/privacy", "/admin/log", "/admin/team", "/admin/unknown-new-page"]) {
    ok(can(sup!, needFor(path)), `super can open ${path}`);
    for (const [name, acc] of [["care", c], ["dev", d], ["tweaked", t]] as const) ok(!can(acc, needFor(path)), `${name} must NOT open ${path}`);
  }
  for (const n of ["super"] as Need[]) for (const acc of [c, d, t]) ok(!can(acc, n), "nobody but super passes 'super'");
  // Role defaults
  ok(can(c, needFor("/admin/inbox")) && can(c, "inbox.act"), "care: inbox");
  ok(can(c, needFor("/admin/accounts/42")), "care: account detail (nested route)");
  ok(!can(c, needFor("/admin/jobs")), "care: no jobs");
  ok(can(d, needFor("/admin/jobs")) && can(d, "incidents.act"), "dev: jobs + incidents");
  ok(!can(d, needFor("/admin/accounts")), "dev: no user data");
  ok(!can(d, needFor("/admin/inbox")), "dev: no inbox");
  // act implies read
  ok(can(c, "feedback.read") && can(c, "users.read"), "act/support imply read");
  // Grants and denials
  ok(can(t, needFor("/admin/jobs")) && can(t, needFor("/admin/security")), "tweaked: granted extras");
  ok(!can(t, "inbox.act") && !can(t, needFor("/admin/inbox")), "tweaked: denied inbox.act removes inbox entirely");
  // Unknown junk in stored perms is ignored
  await q.run("UPDATE ops_members SET grant_perms = 'super,ops.members,takedowns' WHERE user_id = ?", care);
  const c2 = (await A(care, "care@rbac.test"))!;
  ok(!can(c2, "super") && !can(c2, needFor("/admin/takedowns")), "stored junk can't grant super powers");
  // Landing page
  ok(homeFor(sup!) === "/admin" && homeFor(c) === "/admin", "home: overview");
  const noOverview = (await (async () => { await ins(await mk("x@rbac.test"), "developer", "", "overview"); return null; })(), null);
  void noOverview;
  for (const r of Object.keys(ROLE_PERMS)) ok(ROLE_PERMS[r as keyof typeof ROLE_PERMS].length > 0, `role ${r} has defaults`);
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
