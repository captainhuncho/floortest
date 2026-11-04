import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { after } from "node:test";
import { gunzipSync } from "node:zlib";
import { testDataDir } from "./test-db";

/** An empty folder for a database that must start with nothing (testDataDir gives a migrated copy). */
const emptyDir = (prefix: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "pg");
};

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-restore-drill-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.BACKUP_KEY = "test-backup-key-".padEnd(48, "z");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.BACKUP_BUCKET;

// The real practice restore (Safety, 4 Nov): the app's own nightly backup, restored into a second, empty database
// with scripts/restore-drill-pg.ts's restore and checks. Production runs it into a new Neon branch.
async function seededBackup() {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { runBackup } = await import("../src/lib/backup");
  const { openBackup } = await import("../src/lib/backup-crypto");
  const R = await import("../src/lib/receipt-token");
  const t = Date.now();
  const desk = async (h: string) => {
    const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?) RETURNING id", `${h}@x.io`, h, h, t))!.id;
    const sid = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", uid, `${h}-s@x.io`, t))!.id;
    const tokens = [R.newReceiptToken(), R.newReceiptToken()];
    for (const [i, token] of tokens.entries()) {
      const id = (await q.get<{ id: number }>(
        "INSERT INTO tracks (user_id, sender_id, token, title, artist, file_key, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', ?, 't.wav', 'audio/wav', 1, ?) RETURNING id",
        uid, sid, token, `tracks/${h}-${i}.wav`, t,
      ))!.id;
      // One sealed (as new tracks are), one not yet (as the nightly batch would find it).
      if (i === 0) await q.tx((db) => R.storeReceiptToken(db, id, token));
      else await q.run("UPDATE tracks SET token_hash = ? WHERE id = ?", (await import("../src/lib/token-hash")).hashToken(token), id);
    }
    return uid;
  };
  await desk("drilla");
  await desk("drillb");
  const store = await storage();
  const { key } = await runBackup(t);
  const file = Buffer.from(await new Response((await store.stream(key)).body).arrayBuffer());
  return { key, dump: JSON.parse(gunzipSync(openBackup(file, process.env.BACKUP_KEY!)).toString()) };
}

test("the nightly backup restores into an empty database and every check passes", async () => {
  const { openPglite } = await import("../src/lib/db/client");
  const { restoreInto, checkRestore, drillEvidence } = await import("../src/lib/restore-drill");
  const { key, dump } = await seededBackup();
  const target = await openPglite(emptyDir("ft-restore-target-"));
  try {
    const restored = await restoreInto(target, dump);
    assert.ok(await target.get("SELECT 1 FROM schema_migrations LIMIT 1"), "migrations recorded");
    const heads: string[] = [];
    const checks = await checkRestore(target, restored, { vaultHead: async (k) => (heads.push(k), { size: 1 }) });
    const by = Object.fromEntries(checks.map((c) => [c.name, c]));
    for (const c of checks) assert.ok(c.ok && !c.skipped, `${c.name}: ${c.detail}`);
    assert.match(by["Row counts"].detail, /all match/);
    assert.match(by["Foreign keys"].detail, /0 orphan rows/);
    assert.match(by["Each person sees only their own desk"].detail, /tracks 0 \(must be 0\)/);
    assert.match(by["Sealed receipt links open"].detail, /^2\/2 /);
    // The backup replaced every plain token with a stand-in: the two unsealed ones stay unsealed, no hash changes.
    assert.match(by["The sealer after a restore"].detail, /^2 restored stand-in.*0 hash\(es\) changed/);
    assert.equal(heads.length, 4, "every track's file looked up in the vault");
    // A new row after the restore takes a fresh id, not one the backup already used.
    const before = Number((await target.get<{ n: number }>("SELECT MAX(id)::int AS n FROM users"))!.n);
    const id = (await target.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('new@x.io','h','N','drillnew','pro','UTC',1) RETURNING id"))!.id;
    assert.ok(id > before);
    const md = drillEvidence({ date: "2026-11-04", backupKey: key, backupAt: dump.created_at, target: "local test database", checks, rtoMs: 90_000, rpoMs: 3_600_000, commit: "test" });
    assert.match(md, /every check passed/);
    assert.match(md, /RTO .*1\.5 min/);
  } finally {
    await target.close();
  }
});

test("a target that isn't empty is refused before anything is written", async () => {
  const { openPglite, migrate } = await import("../src/lib/db/client");
  const { restoreInto } = await import("../src/lib/restore-drill");
  const busy = await openPglite(emptyDir("ft-restore-busy-"));
  try {
    await migrate(busy);
    const users = Number((await busy.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM users"))!.n);
    await assert.rejects(restoreInto(busy, { created_at: "x", tables: { users: [] } }), /isn't empty/);
    assert.equal(Number((await busy.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM users"))!.n), users, "nothing deleted");
  } finally {
    await busy.close();
  }
});

test("a backup with a broken foreign key fails the restore and leaves no rows", async () => {
  const { openPglite } = await import("../src/lib/db/client");
  const { restoreInto } = await import("../src/lib/restore-drill");
  const target = await openPglite(emptyDir("ft-restore-broken-"));
  try {
    const orphan = { id: 99, user_id: 12345, email: "o@x.io", name: "O", created_at: 1 };
    await assert.rejects(restoreInto(target, { created_at: "x", tables: { senders: [orphan] } }), /foreign key|violates/i);
    assert.equal(Number((await target.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM senders"))!.n), 0, "the load was undone");
  } finally {
    await target.close();
  }
});

test("the drill command refuses production settings and runs only with --confirm-drill", () => {
  const src = fs.readFileSync(path.join(__dirname, "../scripts/restore-drill-pg.ts"), "utf8");
  assert.match(src, /process\.env\.DATABASE_URL \|\| process\.env\.POSTGRES_URL/);
  assert.match(src, /--confirm-drill/);
  assert.match(src, /hidden\(/, "keys are typed hidden");
});
