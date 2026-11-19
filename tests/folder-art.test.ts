import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";
import { agreeTerms } from "./agree-terms";

// A project's or folder's own cover (owner, 19 Nov: "Change cover"). The owner and A&R / Admins change it; everyone
// working the desk sees it; nobody else does. Replaced, removed or deleted with its project or folder, the old file is
// queued for deletion, and account erasure finds it.
process.env.DATA_DIR = testDataDir("ft-folder-art-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "fa-staff@example.test";
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
    `fa${n}@example.test`, `Person ${n}`, `fauser${n}`, plan, now(), now(), now(),
  ))!.id);
  await agreeTerms(id);
  return id;
}

async function signIn(userId: number, deskId?: number) {
  const { createSession } = await import("../src/lib/auth");
  const jar: Jar = new Map();
  await inRequest(jar, "10.9.0.3", () => createSession(userId));
  if (deskId) jar.set("ft_desk", String(deskId));
  return jar;
}

const png = async () => {
  const sharp = (await import("sharp")).default;
  return new Uint8Array(await sharp({ create: { width: 40, height: 40, channels: 3, background: "#d5ff48" } }).png().toBuffer());
};

/** Calls the route as `jar`; the status. */
async function call(jar: Jar, method: "GET" | "POST" | "DELETE", kind: string, id: number | string, bytes?: Uint8Array) {
  return (await answer(jar, method, kind, id, bytes)).status;
}

/** Calls the route as `jar`; the status and the body text. */
async function answer(jar: Jar, method: "GET" | "POST" | "DELETE", kind: string, id: number | string, bytes?: Uint8Array) {
  const route = await import("../src/app/api/folder-art/[kind]/[id]/route");
  let body: ArrayBuffer | undefined;
  const headers: Record<string, string> = {};
  if (bytes) {
    const form = new FormData();
    form.append("file", new File([bytes as BlobPart], "cover.png", { type: "image/png" }));
    // Buffered up front, so a route that stops reading early leaves no stream open after the test.
    const encoded = new Response(form);
    headers["content-type"] = encoded.headers.get("content-type")!;
    body = await encoded.arrayBuffer();
  }
  const req = new Request(`http://localhost/api/folder-art/${kind}/${id}?v=x`, { method, body, headers });
  const ctx = { params: Promise.resolve({ kind, id: String(id) }) } as never;
  const out = await inRequest(jar, "10.9.0.3", () => route[method](req, ctx), { dropAfter: true });
  const res = out.answer as Response;
  return { status: res.status, body: await res.text() };
}

const artOf = async (table: string, id: number) => {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ art_key: string | null }>(`SELECT art_key FROM ${table} WHERE id = ?`, id))?.art_key ?? null;
};
/** Removed from storage and no longer waiting in the deletion queue. */
const gone = async (key: string) => {
  const { storage } = await import("../src/lib/storage");
  const { q } = await import("../src/lib/db");
  return !(await (await storage()).head(key)) && !(await q.get("SELECT 1 FROM storage_deletions WHERE file_key = ?", key));
};
const queued = async (key: string) => {
  const { q } = await import("../src/lib/db");
  return !!(await q.get("SELECT 1 FROM storage_deletions WHERE file_key = ?", key));
};

async function desk() {
  const { q, now } = await import("../src/lib/db");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now());
  const owner = await person("team");
  const admin = await person();
  const member = await person();
  const stranger = await person();
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", owner, admin, now());
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner, member, now());
  const project = Number((await q.get<{ id: number }>("INSERT INTO library_folders (user_id, name, created_at) VALUES (?, 'Summer EP', ?) RETURNING id", owner, now()))!.id);
  const folder = Number((await q.get<{ id: number }>("INSERT INTO desk_folders (user_id, kind, name, created_at) VALUES (?, 'project', 'Releases', ?) RETURNING id", owner, now()))!.id);
  return { owner, admin, member, stranger, project, folder };
}

for (const [kind, table] of [["project", "library_folders"], ["folder", "desk_folders"]] as const) {
  test(`a ${kind} cover: the owner and admins change it, the whole desk sees it, nobody else does`, async () => {
    const { storage } = await import("../src/lib/storage");
    const { q } = await import("../src/lib/db");
    const d = await desk();
    const id = kind === "project" ? d.project : d.folder;
    const owner = await signIn(d.owner);

    assert.equal(await call(await signIn(d.member, d.owner), "POST", kind, id, await png()), 403, "a Member can't change it");
    // A desk they don't work: the shared guard answers 409 (src/lib/auth.ts currentDeskForChange), never their own desk.
    assert.equal(await call(await signIn(d.stranger, d.owner), "POST", kind, id, await png()), 409, "a stranger naming the desk can't");
    assert.equal(await call(await signIn(d.stranger), "POST", kind, id, await png()), 404, "nor from their own desk");
    assert.equal(await call(new Map(), "POST", kind, id, await png()), 404, "nor signed out");
    assert.equal(await artOf(table, id), null, "still no cover");
    assert.equal(await call(owner, "POST", kind, id, new TextEncoder().encode("<svg onload=alert(1)>")), 415, "not an image");

    assert.equal(await call(owner, "POST", kind, id, await png()), 200, "the owner sets it");
    const first = (await artOf(table, id))!;
    assert.match(first, new RegExp(`^folder-art/${kind[0]}${id}-[0-9a-f]{12}\\.webp$`));
    assert.ok(await (await storage()).head(first), "stored");
    assert.equal(await q.get("SELECT 1 FROM file_reservations WHERE file_key = ?", first), undefined, "reservation crossed off");

    assert.equal(await call(owner, "GET", kind, id), 200, "the owner sees it");
    assert.equal(await call(await signIn(d.admin, d.owner), "GET", kind, id), 200, "an A&R / Admin on the desk");
    assert.equal(await call(await signIn(d.member, d.owner), "GET", kind, id), 200, "a Member on the desk");
    assert.equal(await call(await signIn(d.member), "GET", kind, id), 404, "the same Member on their own desk");
    assert.equal(await call(await signIn(d.stranger, d.owner), "GET", kind, id), 404, "a stranger naming the desk");
    assert.equal(await call(new Map(), "GET", kind, id), 404, "signed out");

    assert.equal(await call(await signIn(d.admin, d.owner), "POST", kind, id, await png()), 200, "an admin replaces it");
    const second = (await artOf(table, id))!;
    assert.notEqual(second, first);
    assert.ok(await gone(first), "the replaced cover is deleted");

    assert.equal(await call(await signIn(d.member, d.owner), "DELETE", kind, id), 403, "a Member can't remove it");
    assert.equal(await call(owner, "DELETE", kind, id), 200, "the owner removes it");
    assert.equal(await artOf(table, id), null);
    assert.ok(await gone(second), "the removed cover is deleted");
    assert.equal(await call(owner, "GET", kind, id), 404, "nothing to show");
  });
}

test("deleting a project or folder deletes its cover; account erasure and the leftover check know the covers", async () => {
  const { accountKeys } = await import("../src/lib/deletion-core");
  const { deleteFolder } = await import("../src/lib/library");
  const { deleteDeskFolder } = await import("../src/lib/desk-folders");
  const { q } = await import("../src/lib/db");
  const d = await desk();
  const owner = await signIn(d.owner);
  assert.equal(await call(owner, "POST", "project", d.project, await png()), 200);
  assert.equal(await call(owner, "POST", "folder", d.folder, await png()), 200);
  const p = (await artOf("library_folders", d.project))!;
  const f = (await artOf("desk_folders", d.folder))!;

  const keys = await q.tx((db) => accountKeys(db, d.owner));
  assert.ok(keys.includes(p) && keys.includes(f), "erasing the account deletes both covers");

  // A reservation left over for a cover in use (a crash before it was crossed off): the nightly check keeps the file.
  const { reconcileFiles, RESERVATION_GRACE_MS } = await import("../src/lib/file-reservations");
  await q.run("INSERT INTO file_reservations (file_key, kind, created_at) VALUES (?, 'folder_art', ?), (?, 'folder_art', ?)", p, 1, f, 1);
  assert.equal(await reconcileFiles(Date.now() + RESERVATION_GRACE_MS), 0, "covers in use are never queued");

  const deskUser = { id: d.owner, actor_id: d.owner };
  assert.ok(await deleteFolder(deskUser, d.project));
  assert.ok(await gone(p), "the project's cover goes with it");
  assert.ok(await deleteDeskFolder(deskUser, d.folder));
  assert.ok(await gone(f), "the folder's cover goes with it");
});

test("staff viewing the desk can't change or remove a cover", async () => {
  const { q } = await import("../src/lib/db");
  const { signViewAs, VIEW_AS_COOKIE } = await import("../src/lib/auth");
  const d = await desk();
  const t = Date.now();
  const staff = Number((await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_enabled_at) VALUES ('fa-staff@example.test', 'h', 'Staff', 'fastaff', 'free', 'dj', 'UTC', ?, ?, ?) RETURNING id",
    t, t, t,
  ))!.id);
  const session = crypto.randomBytes(32).toString("hex");
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?,?,?,?,?)", session, staff, t + 3_600_000, t, t);
  assert.equal(await call(await signIn(d.owner), "POST", "project", d.project, await png()), 200);
  const before = await artOf("library_folders", d.project);
  for (const [kind, id] of [["project", d.project], ["folder", d.folder]] as const) {
    const jar = await signIn(d.owner);
    jar.set(VIEW_AS_COOKIE, signViewAs(staff, d.owner, session, process.env.APP_SECRET!));
    assert.equal(await call(jar, "POST", kind, id, await png()), 404, `View as can't set a ${kind} cover`);
    assert.equal(await call(jar, "DELETE", kind, id), 404, `View as can't remove a ${kind} cover`);
  }
  assert.equal(await artOf("library_folders", d.project), before, "the cover is unchanged");
  assert.equal(await artOf("desk_folders", d.folder), null);
});

test("a body over 8 MB is refused before anything is stored", async () => {
  const { q } = await import("../src/lib/db");
  const d = await desk();
  const big = new Uint8Array(9 * 1024 * 1024);
  big.set(await png());
  assert.equal(await call(await signIn(d.owner), "POST", "project", d.project, big), 413);
  assert.equal(await artOf("library_folders", d.project), null);
  assert.equal(await q.get("SELECT 1 FROM file_reservations WHERE file_key LIKE ?", `folder-art/p${d.project}-%`), undefined, "nothing reserved or written");
});

test("an unknown id, another kind or a non-number all get the same 404", async () => {
  const d = await desk();
  const owner = await signIn(d.owner);
  const want = await answer(owner, "POST", "project", 99_999_999, await png());
  assert.equal(want.status, 404);
  for (const [kind, id] of [["collection", d.project], ["project", "abc"], ["folder", 99_999_999], ["project", "-1"]] as const) {
    for (const method of ["POST", "DELETE"] as const) {
      const got = await answer(owner, method, kind, id, method === "POST" ? await png() : undefined);
      assert.deepEqual(got, want, `${method} ${kind}/${id}`);
    }
    assert.equal(await call(owner, "GET", kind, id), 404, `GET ${kind}/${id}`);
  }
});

test("the old cover is queued in the same transaction, so a crash before it's deleted can't orphan it", async () => {
  const { setArt } = await import("../src/lib/folder-art");
  const { drainNow } = await import("../src/lib/deletion");
  const { q } = await import("../src/lib/db");
  const d = await desk();
  assert.equal(await call(await signIn(d.owner), "POST", "folder", d.folder, await png()), 200);
  const first = (await artOf("desk_folders", d.folder))!;
  // The database change alone, with no clean-up after it (as if the server stopped there).
  await setArt("folder", d.folder, d.owner, "folder-art/replacement.webp");
  assert.ok(await queued(first), "replacing queues the old cover");
  await q.run("DELETE FROM desk_folders WHERE id = ?", d.folder);
  assert.ok(await queued("folder-art/replacement.webp"), "deleting the folder queues its cover");
  await drainNow();
  assert.ok(await gone(first), "the queue deletes it");
});
