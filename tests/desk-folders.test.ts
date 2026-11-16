import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-desk-folders-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;
delete process.env.RESEND_API_KEY;

test("folders: one kind each, private to the desk, refused across desks and kinds even in raw SQL, delete unfiles", async () => {
  const { q, asPerson, USER_COLUMNS } = await import("../src/lib/db");
  const { addCollection } = await import("../src/lib/desk");
  const lib = await import("../src/lib/library");
  const f = await import("../src/lib/desk-folders");
  const t = Date.now();
  const make = async (handle: string) => {
    const id = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?,'h','N',?,'free','UTC',?,?) RETURNING id", `${handle}@x.io`, handle, t, t))!.id;
    const row = (await q.get<Record<string, unknown>>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!;
    return { ...row, actor_id: id, actor_name: "N", role: "owner" } as never as Parameters<typeof lib.createFolder>[0] & { id: number; actor_id: number };
  };
  const a = await make("folda");
  const b = await make("foldb");

  const callout = (await addCollection(a.id, "Summer callout"))!;
  const project = await lib.createFolder(a, "Deep EP");
  const cFolder = await f.createDeskFolder(a, "callout", "  House   callouts ");
  const pFolder = await f.createDeskFolder(a, "project", "EPs");
  await assert.rejects(f.createDeskFolder(a, "callout", "   "), /Give the folder a name/);

  // Filing within the right kind works and shows in the lists.
  assert.ok(await f.fileInFolder(a, "callout", callout, cFolder));
  assert.ok(await f.fileInFolder(a, "project", project, pFolder));
  assert.deepEqual((await f.listDeskFolders(a, "callout")).map((x) => [x.name, x.count]), [["House callouts", 1]]);
  assert.deepEqual((await f.listDeskFolders(a, "project")).map((x) => [x.name, x.count]), [["EPs", 1]]);
  assert.equal((await lib.listFolders(a)).find((x) => x.id === project)!.desk_folder_id, pFolder);
  const tile = (await f.listDeskFolders(a, "callout"))[0].preview;
  assert.deepEqual(tile.map((x) => [x.id, x.name, x.art]), [[callout, "Summer callout", null]], "the tile previews what's inside");
  await q.run("UPDATE collections SET art_key = 'k/1' WHERE id = ?", callout);
  assert.equal((await f.listDeskFolders(a, "callout"))[0].preview[0].art, `/api/collection-art/${callout}?v=k%2F1`);
  assert.equal((await f.listDeskFolders(a, "project"))[0].preview[0].art, null, "projects have no art yet");

  // Never mixed: a callout can't go in a project folder, nor a project in a callout folder.
  assert.ok(!(await f.fileInFolder(a, "callout", callout, pFolder)));
  assert.ok(!(await f.fileInFolder(a, "project", project, cFolder)));

  // Another desk sees, renames, deletes and files into none of it.
  assert.deepEqual(await f.listDeskFolders(b, "callout"), []);
  assert.ok(!(await f.renameDeskFolder(b, cFolder, "Taken")));
  assert.ok(!(await f.deleteDeskFolder(b, cFolder)));
  assert.ok(!(await f.fileInFolder(b, "callout", callout, null)), "can't unfile another desk's callout");
  const bCallout = (await addCollection(b.id, "B callout"))!;
  assert.ok(!(await f.fileInFolder(b, "callout", bCallout, cFolder)), "can't file into another desk's folder");

  // The database holds the line on its own, as the person, past the helpers.
  const asB = (sql: string, ...args: unknown[]) => asPerson(b.actor_id, () => q.run(sql, ...args));
  await assert.rejects(asB("UPDATE collections SET desk_folder_id = ? WHERE id = ?", cFolder, bCallout), "another desk's folder is refused by the key");
  const asA = (sql: string, ...args: unknown[]) => asPerson(a.actor_id, () => q.run(sql, ...args));
  await assert.rejects(asA("UPDATE collections SET desk_folder_id = ? WHERE id = ?", pFolder, callout), "a project folder for a callout is refused");
  await assert.rejects(asA("UPDATE library_folders SET desk_folder_id = ? WHERE id = ?", cFolder, project), "a callout folder for a project is refused");
  await assert.rejects(asA("UPDATE desk_folders SET kind = 'project' WHERE id = ?", cFolder), "a folder's kind can't be changed as the person");
  await assert.rejects(asA("UPDATE desk_folders SET user_id = ? WHERE id = ?", b.id, cFolder), "a folder can't be moved to another desk");
  await assert.rejects(asB("INSERT INTO desk_folders (user_id, kind, name, created_at) VALUES (?,?,?,?)", a.id, "callout", "Planted", t), "can't make a folder on another desk");
  assert.equal(await asPerson(b.actor_id, () => q.count("SELECT COUNT(*) AS n FROM desk_folders")), 0, "row-level security shows B none of A's folders");

  // A teammate works the desk's folders while on the team, and loses them once removed (a stale member sees nothing).
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?,?,'admin',?)", a.id, b.id, t);
  assert.equal(await asPerson(b.actor_id, () => q.count("SELECT COUNT(*) AS n FROM desk_folders")), 2, "a current teammate sees the desk's folders");
  await q.run("DELETE FROM account_members WHERE account_id = ? AND user_id = ?", a.id, b.id);
  assert.equal(await asPerson(b.actor_id, () => q.count("SELECT COUNT(*) AS n FROM desk_folders")), 0, "a removed teammate sees none");
  await assert.rejects(asB("UPDATE desk_folders SET name = 'Gone' WHERE id = ? RETURNING id", cFolder).then(async () => {
    if ((await q.get<{ name: string }>("SELECT name FROM desk_folders WHERE id = ?", cFolder))!.name === "Gone") throw new Error("changed");
    throw new Error("no-op");
  }), /no-op/, "a removed teammate's rename changes nothing");

  // Renaming works for the desk; deleting a folder leaves its callouts and projects, in no folder.
  assert.ok(await f.renameDeskFolder(a, cFolder, "Techno callouts"));
  assert.ok(await f.deleteDeskFolder(a, cFolder));
  assert.ok(await f.deleteDeskFolder(a, pFolder));
  assert.equal((await q.get<{ desk_folder_id: number | null }>("SELECT desk_folder_id FROM collections WHERE id = ?", callout))!.desk_folder_id, null);
  assert.equal((await q.get<{ desk_folder_id: number | null }>("SELECT desk_folder_id FROM library_folders WHERE id = ?", project))!.desk_folder_id, null);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM collections WHERE id = ?", callout), 1, "the callout stays");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM library_folders WHERE id = ?", project), 1, "the project stays");
});
