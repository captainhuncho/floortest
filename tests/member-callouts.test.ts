import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest } from "./request-scope";
import { agreeTerms } from "./agree-terms";

// Owner, 16 Nov: owners and A&R / Admins run callouts by role; a Member only once an owner or admin ticks them.
process.env.DATA_DIR = testDataDir("ft-member-callouts-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;
delete process.env.VERCEL_ENV;

let n = 0;
async function person(plan = "free") {
  const { q, now } = await import("../src/lib/db");
  n++;
  const id = Number((await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_enabled_at) VALUES (?, 'h', ?, ?, ?, 'dj', 'UTC', ?, ?, ?) RETURNING id",
    `mc${n}@example.test`, `Person ${n}`, `mcuser${n}`, plan, now(), now(), now(),
  ))!.id);
  await agreeTerms(id);
  return id;
}

async function setup() {
  const { q, now } = await import("../src/lib/db");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now());
  const owner = await person("team");
  const admin = await person();
  const member = await person();
  const add = async (uid: number, role: string) =>
    Number((await q.get<{ id: number }>("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, ?, ?) RETURNING id", owner, uid, role, now()))!.id);
  const adminRow = await add(admin, "admin");
  const memberRow = await add(member, "member");
  // What a desk looks like to each person working it (the shape currentDesk gives).
  const desk = (actor: number, role: "owner" | "admin" | "member") => ({ id: owner, actor_id: actor, role, totp_enabled_at: now() });
  return { owner, admin, member, adminRow, memberRow, desk };
}

test("who runs callouts: owner and A&R / Admin by role; a Member only while ticked; role change and re-adding start unticked", async () => {
  const { q, now } = await import("../src/lib/db");
  const m = await import("../src/lib/account-members");
  const s = await setup();
  assert.ok(await m.canRunCallouts(s.desk(s.owner, "owner")));
  assert.ok(await m.canRunCallouts(s.desk(s.admin, "admin")));
  assert.ok(!(await m.canRunCallouts(s.desk(s.member, "member"))), "existing and new members start unticked");

  await m.setMemberCallouts(s.desk(s.admin, "admin"), s.memberRow, true);
  assert.ok(await m.canRunCallouts(s.desk(s.member, "member")), "an A&R / Admin can tick a Member");
  await m.setMemberCallouts(s.desk(s.owner, "owner"), s.memberRow, false);
  assert.ok(!(await m.canRunCallouts(s.desk(s.member, "member"))), "untick applies at once");

  // A role change clears the tick: made A&R / Admin and back, they start unticked.
  await m.setMemberCallouts(s.desk(s.owner, "owner"), s.memberRow, true);
  await m.setTeamRole(s.desk(s.owner, "owner"), s.memberRow, "admin");
  await m.setTeamRole(s.desk(s.owner, "owner"), s.memberRow, "member");
  assert.ok(!(await m.canRunCallouts(s.desk(s.member, "member"))));

  // Removed and invited again: a fresh row, unticked.
  await m.setMemberCallouts(s.desk(s.owner, "owner"), s.memberRow, true);
  await m.removeFromTeam({ ...s.desk(s.owner, "owner") }, s.memberRow);
  assert.ok(!(await m.canRunCallouts(s.desk(s.member, "member"))), "removed: no right");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", s.owner, s.member, now());
  assert.ok(!(await m.canRunCallouts(s.desk(s.member, "member"))), "re-added: starts unticked");
});

test("only the desk's owner or an A&R / Admin ticks, only their own desk's Members, never themselves, with one answer for missing and foreign ids", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const m = await import("../src/lib/account-members");
  const s = await setup();
  const other = await setup();
  await assert.rejects(m.setMemberCallouts(s.desk(s.member, "member"), s.memberRow, true), /Only the owner or an A&R \/ Admin/, "a Member can't tick anyone, themselves included");
  await assert.rejects(m.setMemberCallouts(s.desk(s.admin, "admin"), other.memberRow, true), /^Error: Not found$|Not found/, "another desk's member");
  await assert.rejects(m.setMemberCallouts(s.desk(s.admin, "admin"), 99_999_999, true), /Not found/, "a missing id: same answer");
  await assert.rejects(m.setMemberCallouts(s.desk(s.owner, "owner"), s.adminRow, true), /Not found/, "only Member rows take the tick");
  assert.ok(!(await m.canRunCallouts(other.desk(other.member, "member"))), "nothing changed on the other desk");

  // The database refuses the person on their own row, past the app.
  await assert.rejects(asPerson(s.member, () => q.run("UPDATE account_members SET callouts = true WHERE user_id = ?", s.member)), /permission denied/);
  await assert.rejects(asPerson(s.owner, () => q.run("UPDATE account_members SET callouts = true WHERE id = ?", s.memberRow)), /permission denied/, "even the owner goes through the app");
  assert.ok(!(await m.canRunCallouts(s.desk(s.member, "member"))));
});

test("actions: an unticked Member is refused creating or editing a callout and changing its artwork; ticked, they can; delete stays admin", async () => {
  const { q } = await import("../src/lib/db");
  const { createSession, DESK_COOKIE } = await import("../src/lib/auth");
  const m = await import("../src/lib/account-members");
  const actions = await import("../src/app/dashboard/actions/collections");
  const art = await import("../src/app/api/collection-art/[id]/route");
  const s = await setup();
  const jar = new Map<string, string>();
  await inRequest(jar, "203.0.113.9", () => createSession(s.member));
  jar.set(DESK_COOKIE, String(s.owner));
  const form = (name: string) => {
    const f = new FormData();
    f.set("name", name);
    return f;
  };
  const count = () => q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", s.owner);

  const refused = await inRequest(jar, "203.0.113.9", () => actions.createCollection(form("Nope")), { dropAfter: true });
  assert.equal(refused.redirect, "/dashboard/collections?denied=callouts");
  assert.equal(await count(), 0);
  const c = Number((await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Owner callout', ?) RETURNING id", s.owner, Date.now()))!.id);
  const edit = await inRequest(jar, "203.0.113.9", () => actions.updateCollection(c, form("Renamed")), { dropAfter: true });
  assert.equal(edit.redirect, "/dashboard/collections?denied=callouts");
  assert.equal((await q.get<{ name: string }>("SELECT name FROM collections WHERE id = ?", c))!.name, "Owner callout");
  const del = await inRequest(jar, "203.0.113.9", () => art.DELETE(new Request(`http://localhost/api/collection-art/${c}`, { method: "DELETE" }), { params: Promise.resolve({ id: String(c) }) } as never), { dropAfter: true });
  assert.equal((del.answer as Response).status, 403, "artwork: refused");

  await m.setMemberCallouts(s.desk(s.owner, "owner"), s.memberRow, true);
  await inRequest(jar, "203.0.113.9", () => actions.createCollection(form("Mine")), { dropAfter: true });
  assert.equal(await count(), 2, "ticked: creates");
  await inRequest(jar, "203.0.113.9", () => actions.updateCollection(c, form("Renamed")), { dropAfter: true });
  assert.equal((await q.get<{ name: string }>("SELECT name FROM collections WHERE id = ?", c))!.name, "Renamed", "ticked: edits");
  const delOk = await inRequest(jar, "203.0.113.9", () => art.DELETE(new Request(`http://localhost/api/collection-art/${c}`, { method: "DELETE" }), { params: Promise.resolve({ id: String(c) }) } as never), { dropAfter: true });
  assert.notEqual((delOk.answer as Response).status, 403, "ticked: artwork allowed");
  const gone = await inRequest(jar, "203.0.113.9", () => actions.deleteCollection(c, "RENAMED"), { dropAfter: true });
  assert.equal(gone.redirect, "/dashboard/settings/team?denied=1", "deleting stays with the owner and A&R / Admins");
});
