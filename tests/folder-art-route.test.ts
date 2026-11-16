import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { agreeTerms } from "./agree-terms";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";

// The real route handler, signed in through real sessions in a request scope the test controls.
process.env.DATA_DIR = testDataDir("ft-folder-art-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;
delete process.env.SITE_PASSWORD;

let serial = 0;
const route = () => import("../src/app/api/folder-art/[type]/[id]/route");
async function account() {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const h = `artdesk${++serial}`;
  return (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', 'A', ?, 'pro', 'UTC', ?, ?) RETURNING id", `${h}@x.io`, h, t, t))!.id;
}
async function signIn(userId: number) {
  const { createSession } = await import("../src/lib/auth");
  const jar: Jar = new Map();
  await inRequest(jar, "10.9.0.1", () => createSession(userId));
  await agreeTerms(userId);
  return jar;
}
const ctx = (type: string, id: number | string) => ({ params: Promise.resolve({ type, id: String(id) }) });
async function upload(jar: Jar, type: string, id: number, bytes: Uint8Array, name = "c.png") {
  const { POST } = await route();
  const form = new FormData();
  form.set("file", new File([Buffer.from(bytes)], name, { type: "image/png" }));
  const req = new Request(`http://localhost/api/folder-art/${type}/${id}`, { method: "POST", body: form });
  return (await inRequest(jar, "10.9.0.1", () => POST(req, ctx(type, id)), { dropAfter: true })).answer as Response;
}
async function get(jar: Jar, type: string, id: number) {
  const { GET } = await route();
  return (await inRequest(jar, "10.9.0.1", () => GET(new Request(`http://localhost/api/folder-art/${type}/${id}`), ctx(type, id)), { dropAfter: true })).answer as Response;
}
async function remove(jar: Jar, type: string, id: number) {
  const { DELETE } = await route();
  return (await inRequest(jar, "10.9.0.1", () => DELETE(new Request(`http://localhost/api/folder-art/${type}/${id}`, { method: "DELETE" }), ctx(type, id)), { dropAfter: true })).answer as Response;
}

test("project and folder covers: owner sets, replaces and removes; another desk and the wrong type get one 404; bad files refused; deleting queues the art", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const lib = await import("../src/lib/library");
  const f = await import("../src/lib/desk-folders");
  const png = new Uint8Array(await sharp({ create: { width: 40, height: 40, channels: 3, background: "#3a7" } }).png().toBuffer());
  const a = await account();
  const b = await account();
  const desk = { ...(await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, a))!, actor_id: a, actor_name: "A", role: "owner" } as never as Parameters<typeof lib.createFolder>[0];
  const deskB = { ...(await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, b))!, actor_id: b, actor_name: "B", role: "owner" } as never as Parameters<typeof lib.createFolder>[0];
  const project = await lib.createFolder(desk, "Deep EP");
  await f.createDeskFolder(deskB, "callout", "B's"); // so A's folder and project ids differ
  const folder = await f.createDeskFolder(desk, "project", "EPs");
  assert.notEqual(folder, project);
  const ja = await signIn(a);
  const jb = await signIn(b);

  // The owner sets a cover on a project and a folder; the key is the server's own, never the file's name.
  assert.equal((await upload(ja, "project", project, png, "../../evil name.png")).status, 200);
  assert.equal((await upload(ja, "folder", folder, png)).status, 200);
  const pKey = (await q.get<{ art_key: string }>("SELECT art_key FROM library_folders WHERE id = ?", project))!.art_key;
  const fKey = (await q.get<{ art_key: string }>("SELECT art_key FROM desk_folders WHERE id = ?", folder))!.art_key;
  assert.match(pKey, new RegExp(`^folder-art/${a}-[0-9a-f]{12}\\.webp$`));
  assert.match(fKey, new RegExp(`^folder-art/${a}-[0-9a-f]{12}\\.webp$`));
  assert.equal((await get(ja, "project", project)).status, 200, "the desk sees it");
  assert.equal((await lib.listFolders(desk)).find((x) => x.id === project)!.art, `/api/folder-art/project/${project}?v=${encodeURIComponent(pKey)}`);
  assert.equal((await f.listDeskFolders(desk, "project"))[0].art, `/api/folder-art/folder/${folder}?v=${encodeURIComponent(fKey)}`);

  // Another desk: same 404 for reading, setting and removing, and nothing changes.
  for (const r of [await get(jb, "project", project), await upload(jb, "project", project, png), await remove(jb, "folder", folder)]) assert.equal(r.status, 404);
  // The wrong type (a project id asked for as a folder and the reverse), an unknown type and a missing id: the same 404.
  const missing = 999999;
  assert.equal((await upload(ja, "folder", project, png)).status, 404, "a project id sent as a folder");
  assert.equal((await upload(ja, "project", folder, png)).status, 404, "a folder id sent as a project");
  assert.equal((await upload(ja, "callout", project, png)).status, 404);
  assert.equal((await upload(ja, "project", missing, png)).status, 404);
  assert.equal((await q.get<{ art_key: string }>("SELECT art_key FROM library_folders WHERE id = ?", project))!.art_key, pKey, "untouched");

  // Not an image, or too big: refused by the bytes, not the name or type the browser sent.
  assert.equal((await upload(ja, "project", project, new TextEncoder().encode("GIF89a not really"), "c.png")).status, 415);
  assert.equal((await upload(ja, "project", project, new Uint8Array(8 * 1024 * 1024 + 10), "c.png")).status, 413);

  // Replacing queues the old key once the new one is saved; removing queues it too.
  assert.equal((await upload(ja, "project", project, png)).status, 200);
  const pKey2 = (await q.get<{ art_key: string }>("SELECT art_key FROM library_folders WHERE id = ?", project))!.art_key;
  assert.notEqual(pKey2, pKey);
  const queued = (k: string) => q.count("SELECT COUNT(*) AS n FROM storage_deletions WHERE file_key = ?", k);
  const gone = async (k: string) => (await queued(k)) === 1 || !(await (await import("../src/lib/storage")).storage().then((s) => s.head(k)));
  assert.ok(await gone(pKey), "the replaced cover is queued or already deleted");
  assert.equal((await remove(ja, "folder", folder)).status, 200);
  assert.ok(await gone(fKey));
  assert.equal((await q.get<{ art_key: string | null }>("SELECT art_key FROM desk_folders WHERE id = ?", folder))!.art_key, null);

  // Deleting the project takes its cover with it; the account deletion would find any that are left.
  const { accountKeys } = await import("../src/lib/deletion-core");
  assert.ok((await accountKeys(q, a)).includes(pKey2));
  assert.ok(await lib.deleteFolder(desk, project));
  assert.ok(await gone(pKey2), "a deleted project's cover goes too");
});

test("batch Move to project is throttled per person: the 61st batch in an hour is refused before any work", async () => {
  const { allow } = await import("../src/lib/ratelimit");
  const a = await account();
  const jar = await signIn(a);
  for (let i = 0; i < 60; i++) assert.ok(await allow("move_projects", String(a), 60, 3_600_000));
  const { moveManyToProjects } = await import("../src/app/dashboard/actions/music");
  const out = await inRequest(jar, "10.9.0.1", () => moveManyToProjects([1], { project: null }), { dropAfter: true });
  assert.deepEqual(out.answer, { ok: false, error: "Too many moves at once. Try again shortly." });
});
