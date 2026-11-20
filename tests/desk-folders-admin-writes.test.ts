import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest } from "./request-scope";
import { agreeTerms } from "./agree-terms";

// Owner, 20 Nov (board #25, migration 0158): everyone on a desk reads its folders; only the owner and A&R / Admins
// create, rename, cover or delete them, and the database holds that line too, not just the app.
process.env.DATA_DIR = testDataDir("ft-desk-folders-admin-");
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
    `df${n}@example.test`, `Person ${n}`, `dfuser${n}`, plan, now(), now(), now(),
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
  const stranger = await person();
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", owner, admin, now());
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner, member, now());
  const desk = (actor: number) => ({ id: owner, actor_id: actor });
  return { owner, admin, member, stranger, desk };
}

test("as the person: a Member reads the desk's folders but can't create, rename or delete one; the owner and an admin can", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const f = await import("../src/lib/desk-folders");
  const s = await setup();
  const folder = await f.createDeskFolder(s.desk(s.owner), "callout", "Owner's folder");
  const name = async () => (await q.get<{ name: string }>("SELECT name FROM desk_folders WHERE id = ?", folder))?.name;
  const seen = (uid: number) => asPerson(uid, () => q.count("SELECT COUNT(*) AS n FROM desk_folders WHERE user_id = ?", s.owner));

  // Reading: everyone on the desk, nobody else.
  assert.equal(await seen(s.member), 1, "a Member reads the folders");
  assert.equal(await seen(s.admin), 1);
  assert.equal(await seen(s.stranger), 0, "someone off the desk sees none");

  // A Member: every write is refused by the database.
  await assert.rejects(f.createDeskFolder(s.desk(s.member), "callout", "Member folder"), /row-level security/, "create");
  assert.equal(await f.renameDeskFolder(s.desk(s.member), folder, "Member rename"), false, "rename");
  assert.equal(await name(), "Owner's folder");
  assert.equal(await f.deleteDeskFolder(s.desk(s.member), folder), false, "delete");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM desk_folders WHERE user_id = ?", s.owner), 1, "nothing made or deleted");

  // Someone off the desk naming it: refused the same way.
  await assert.rejects(f.createDeskFolder(s.desk(s.stranger), "callout", "Stranger folder"), /row-level security/);
  assert.equal(await f.renameDeskFolder(s.desk(s.stranger), folder, "Stranger"), false);

  // An A&R / Admin and the owner: all allowed.
  const byAdmin = await f.createDeskFolder(s.desk(s.admin), "project", "Admin folder");
  assert.ok(byAdmin > 0, "an admin creates");
  assert.equal(await f.renameDeskFolder(s.desk(s.admin), folder, "Admin rename"), true, "an admin renames");
  assert.equal(await name(), "Admin rename");
  assert.equal(await f.renameDeskFolder(s.desk(s.owner), folder, "Owner rename"), true, "the owner renames");
  assert.equal(await f.deleteDeskFolder(s.desk(s.admin), byAdmin), true, "an admin deletes");
  assert.equal(await f.deleteDeskFolder(s.desk(s.owner), folder), true, "the owner deletes");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM desk_folders WHERE user_id = ?", s.owner), 0);
});

test("covers: a Member is refused (403, nothing stored); an admin and the owner can set one; nobody sets one straight in the database", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { createSession, DESK_COOKIE } = await import("../src/lib/auth");
  const f = await import("../src/lib/desk-folders");
  const route = await import("../src/app/api/folder-art/[kind]/[id]/route");
  const sharp = (await import("sharp")).default;
  const s = await setup();
  const folder = await f.createDeskFolder(s.desk(s.owner), "callout", "Covered");
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#556677" } }).png().toBuffer();
  const upload = async (uid: number) => {
    const jar = new Map<string, string>();
    await inRequest(jar, "203.0.113.50", () => createSession(uid));
    jar.set(DESK_COOKIE, String(s.owner));
    const body = new FormData();
    body.set("file", new File([new Uint8Array(png)], "c.png", { type: "image/png" }));
    const req = new Request(`http://localhost/api/folder-art/folder/${folder}`, { method: "POST", body });
    const out = await inRequest(jar, "203.0.113.50", () => route.POST(req, { params: Promise.resolve({ kind: "folder", id: String(folder) }) } as never), { dropAfter: true });
    return (out.answer as Response).status;
  };
  const cover = async () => (await q.get<{ art_key: string | null }>("SELECT art_key FROM desk_folders WHERE id = ?", folder))!.art_key;

  assert.equal(await upload(s.member), 403, "a Member");
  assert.equal(await cover(), null, "no cover stored");
  assert.equal(await upload(s.admin), 200, "an A&R / Admin");
  const first = await cover();
  assert.match(first ?? "", /^folder-art\//);
  assert.equal(await upload(s.owner), 200, "the owner");
  assert.notEqual(await cover(), first, "the owner's cover replaced it");

  // As the person no one can point a folder at a file: only the name is open to update.
  for (const uid of [s.member, s.admin, s.owner])
    await assert.rejects(asPerson(uid, () => q.run("UPDATE desk_folders SET art_key = 'folder-art/x.webp' WHERE id = ?", folder)), /permission denied/);
});
