import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

process.env.DATA_DIR = testDataDir("ft-ops-palette-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// ⌘K people search (ops kit, 1 Nov): a server path over every account, so it is held to the Users page's rules.
const access = (perms: string[]) => ({ super: false, role: "care", perms: new Set(perms) }) as never;

async function seed() {
  const { q } = await import("../src/lib/db");
  for (let i = 0; i < 12; i++)
    await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?)", `zed${i}@pal.test`, `Zed Person ${i}`, `zed${i}`, Date.now());
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('quiet.mail@pal.test', 'h', 'Ana Ruiz', 'anaruiz', 'free', 'UTC', ?)", Date.now());
}

test("people search: permission, length, cap, email rules and the rate limit", async () => {
  const { searchPeople, findPeople, PALETTE_PER_MINUTE } = await import("../src/lib/ops-palette");
  await seed();
  const reader = { id: 9001, access: access(["users.read"]) };

  const refused = await searchPeople({ id: 9002, access: access(["feedback.act", "inbox.act"]) }, "zed");
  assert.equal(refused.ok, false, "refused without Users (view)");

  assert.deepEqual(await searchPeople(reader, "z"), { ok: true, people: [] }, "one character finds nobody");
  assert.deepEqual(await searchPeople(reader, "  @z "), { ok: true, people: [] }, "the @ and spaces don't count");

  const many = await searchPeople(reader, "zed");
  assert.ok(many.ok);
  assert.equal(many.people.length, 8, "at most eight");
  assert.deepEqual(Object.keys(many.people[0]).sort(), ["email", "handle", "id", "name"], "named fields only");

  const exact = await searchPeople(reader, "@zed11");
  assert.ok(exact.ok);
  assert.equal(exact.people[0].handle, "zed11", "an exact @handle comes first");

  const byEmail = await searchPeople(reader, "quiet.mail");
  assert.ok(byEmail.ok);
  assert.equal(byEmail.people[0]?.handle, "anaruiz", "found by email when emails are shown");

  // Email without an "@" in the query: the part before the "@" only, so a domain never matches everyone.
  const te = await searchPeople(reader, "te");
  assert.ok(te.ok);
  assert.deepEqual(te.people.map((p) => p.handle), [], '"te" is only in the domain (pal.test), so nobody');
  const dom = await searchPeople(reader, "@pal.test");
  assert.ok(dom.ok);
  assert.equal(dom.people.length, 8, "with an @ the whole address counts, domain included (capped at 8)");
  assert.ok(dom.people.every((p) => p.email?.endsWith("@pal.test")));

  // Ranking: the exact @handle first, then names that start with the query, then the rest.
  const zr = await searchPeople(reader, "zed1");
  assert.ok(zr.ok);
  assert.equal(zr.people[0].handle, "zed1", "exact handle first, ahead of zed10 and zed11");
  const named = await searchPeople(reader, "ruiz");
  assert.ok(named.ok);
  assert.deepEqual(named.people.map((p) => p.handle), ["anaruiz"]);
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('m1@pal.test', 'h', 'Abe Mora', 'abemora', 'free', 'UTC', ?)", Date.now());
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('m2@pal.test', 'h', 'Mora Quinn', 'quinnm', 'free', 'UTC', ?)", Date.now());
  const mora = await searchPeople(reader, "mora");
  assert.ok(mora.ok);
  assert.deepEqual(mora.people.map((p) => p.handle), ["quinnm", "abemora"], "a name that starts with it before one that only contains it");

  // A viewer who may not see emails: none in the results, and email isn't searched either.
  const hidden = await findPeople("zed", false);
  assert.ok(hidden.length > 0 && hidden.every((p) => !("email" in p)));
  assert.deepEqual(await findPeople("quiet.mail", false), [], "an email search finds nobody without the email permission");

  // Wildcards are text, not patterns.
  assert.deepEqual(await findPeople("%_", true), []);

  // Rate limit: per staff member, per minute.
  const limited = { id: 9003, access: access(["users.support"]) };
  for (let i = 0; i < PALETTE_PER_MINUTE; i++) assert.ok((await searchPeople(limited, "zed")).ok, `search ${i + 1}`);
  const over = await searchPeople(limited, "zed");
  assert.equal(over.ok, false);
  assert.match(!over.ok ? over.error : "", /Too many searches/);
  assert.ok((await searchPeople({ id: 9004, access: access(["users.read"]) }, "zed")).ok, "another staff member isn't held up");
});
