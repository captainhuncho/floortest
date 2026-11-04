import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";
import type { ReceiptKey } from "../src/lib/receipt-token";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-receipt-token-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const sql = {
  user: "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', 'R', ?, 'pro', 'UTC', ?) RETURNING id",
  sender: "INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id",
  track: "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id",
};

async function setUp(handle: string, token: string | null) {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(sql.user, `${handle}@x.io`, handle, t))!.id;
  const sid = (await q.get<{ id: number }>(sql.sender, uid, `${handle}-s@x.io`, t))!.id;
  const id = (await q.get<{ id: number }>(sql.track, uid, sid, token, t))!.id;
  return { id, email: `${handle}-s@x.io` };
}

// Receipt tokens stored hashed (Safety-reviewed design, 2 Nov): the database holds a hash to find the receipt and a
// sealed copy to rebuild its link. The plain token is still kept this release, so a rollback to the previous build works;
// these tests also clear it, to show lookups and links don't need it (the next release stops keeping it).
test("a new receipt token gets a hash and a sealed copy; with the plain one cleared, the link still opens", async () => {
  const { q } = await import("../src/lib/db");
  const R = await import("../src/lib/receipt-token");
  const { hashToken } = await import("../src/lib/token-hash");
  const { APP_URL } = await import("../src/lib/mail");
  const { id } = await setUp("rtnew", null);
  const token = R.newReceiptToken();
  await q.run("UPDATE tracks SET token = ? WHERE id = ?", token, id);
  await q.tx((db) => R.storeReceiptToken(db, id, token));
  assert.equal((await q.get<{ token: string }>("SELECT token FROM tracks WHERE id = ?", id))!.token, token, "kept this release, for a rollback");
  await q.run("UPDATE tracks SET token = NULL WHERE id = ?", id); // as the next release will
  const row = (await q.get<{ id: number; token: string | null; token_hash: string; token_sealed: string }>("SELECT id, token, token_hash, token_sealed FROM tracks WHERE id = ?", id))!;
  assert.equal(row.token_hash, hashToken(token));
  assert.ok(!row.token_sealed.includes(token), "the sealed copy doesn't show the token");
  assert.deepEqual(await R.findByReceiptToken(token), { id });
  assert.equal(R.receiptUrl(row), `${APP_URL}/receipt/${token}`, "later emails rebuild the link");
  assert.equal(R.receiptToken(row), token);
  // Bound to its row: moved to another track it doesn't open, and the link falls back to /sent (nothing logged).
  assert.equal(R.openReceiptToken(row.token_sealed, id + 1), null);
  assert.equal(R.receiptPath({ id: id + 1, token: null, token_sealed: row.token_sealed }), "/sent");
  assert.equal(R.receiptPath({ id, token: null, token_sealed: `x${row.token_sealed.slice(1)}` }), "/sent", "a damaged copy falls back too");
  assert.equal(await R.findByReceiptToken(`${token}x`), undefined);
  assert.equal(await R.findByReceiptToken(`${token}${"x".repeat(200)}`), undefined, "overlong input is cut, not matched whole");
  assert.equal(R.receiptWhere("x".repeat(500)).args[1], "x".repeat(100));
});

test("an old row keeps working, is sealed on first read (plain token kept), and the nightly batch seals the rest once", async () => {
  const { q } = await import("../src/lib/db");
  const R = await import("../src/lib/receipt-token");
  const { receiptByToken } = await import("../src/lib/receipt");
  const { hashToken } = await import("../src/lib/token-hash");
  const plain = async (id: number) => (await q.get<{ token: string | null; token_hash: string | null; token_sealed: string | null }>("SELECT token, token_hash, token_sealed FROM tracks WHERE id = ?", id))!;

  // Migration 0126 fills token_hash in SQL: it must be the same hash the app looks up with.
  const inSql = (await q.get<{ h: string }>("SELECT encode(sha256(convert_to(?, 'UTF8')), 'hex') AS h", "old-token-aaaa"))!.h;
  assert.equal(inSql, hashToken("old-token-aaaa"));
  // Before migration 0126 a row had only the plain token: found by it, then sealed when the receipt is opened.
  const old = await setUp("rtold", "old-token-aaaa");
  await q.run("UPDATE tracks SET token_hash = NULL WHERE id = ?", old.id);
  assert.ok(await receiptByToken("old-token-aaaa"), "the old link opens");
  const after = await plain(old.id);
  assert.equal(after.token, "old-token-aaaa", "the plain token stays this release, for a rollback");
  assert.equal(after.token_hash, hashToken("old-token-aaaa"));
  assert.equal(R.openReceiptToken(after.token_sealed!, old.id), "old-token-aaaa");
  assert.ok(await receiptByToken("old-token-aaaa"), "and still opens after sealing");

  // The batch, twice at once: every row sealed, none left with neither, the count reaches zero.
  const many = await Promise.all(["b1", "b2", "b3"].map((n, i) => setUp(`rtbatch${i}`, `batch-token-${n}`)));
  const [a, b] = await Promise.all([R.sealOldReceipts(), R.sealOldReceipts()]);
  assert.equal(a.receiptsSealed + b.receiptsSealed, 3, "each row sealed once");
  assert.equal((await R.sealOldReceipts()).receiptsUnsealedLeft, 0);
  for (const m of many) {
    const r = await plain(m.id);
    assert.ok(r.token && r.token_hash && r.token_sealed, "hash and sealed copy added, nothing removed");
  }
  assert.equal((await R.sealOldReceipts()).receiptsSealed, 0, "a sealed row isn't sealed again");
});

test("after a backup restore, the sealer never rewrites a receipt's hash, so its link keeps opening", async () => {
  const { q } = await import("../src/lib/db");
  const R = await import("../src/lib/receipt-token");
  const { hashToken } = await import("../src/lib/token-hash");
  // A row as a restore leaves it: the real hash, no sealed copy, and a random stand-in in token (src/lib/backup.ts).
  const { id } = await setUp("rtrestored", "real-receipt-token-1");
  const realHash = hashToken("real-receipt-token-1");
  await q.run("UPDATE tracks SET token = 'restored-0123456789abcdef', token_hash = ?, token_sealed = NULL WHERE id = ?", realHash, id);
  assert.equal((await q.get<{ token_hash: string }>("SELECT token_hash FROM tracks WHERE id = ?", id))!.token_hash, realHash);

  assert.equal(await R.sealOldReceipt(id, "restored-0123456789abcdef"), false, "a stand-in isn't sealed");
  const batch = await R.sealOldReceipts();
  assert.ok(batch.receiptsRestoredStandIns >= 1, "counted apart, so it never blocks the batch");
  const row = (await q.get<{ token_hash: string; token_sealed: string | null }>("SELECT token_hash, token_sealed FROM tracks WHERE id = ?", id))!;
  assert.equal(row.token_hash, realHash, "the hash is the original");
  assert.equal(row.token_sealed, null);
  assert.deepEqual(await R.findByReceiptToken("real-receipt-token-1"), { id }, "the sender's link still opens");
  // Opening the receipt (the first-read path) doesn't rewrite it either.
  const { receiptByToken } = await import("../src/lib/receipt");
  assert.ok(await receiptByToken("real-receipt-token-1"));
  assert.equal((await q.get<{ token_hash: string }>("SELECT token_hash FROM tracks WHERE id = ?", id))!.token_hash, realHash);
});

test("stored email copies hide the receipt link; erasing a sender removes the hash and sealed copy too", async () => {
  const { q } = await import("../src/lib/db");
  const R = await import("../src/lib/receipt-token");
  const { queueMail, HIDDEN } = await import("../src/lib/mail");
  const { eraseSender } = await import("../src/lib/privacy");
  const { id, email } = await setUp("rtmail", null);
  const token = R.newReceiptToken();
  await q.run("UPDATE tracks SET token = ? WHERE id = ?", token, id);
  await q.tx((db) => R.storeReceiptToken(db, id, token));
  await q.run("UPDATE tracks SET token = NULL WHERE id = ?", id);
  const row = (await q.get<ReceiptKey>("SELECT id, token, token_sealed FROM tracks WHERE id = ?", id))!;
  const mail = await queueMail({ userId: null, audience: "support", to: email, subject: "Listened", body: `See it: ${R.receiptUrl(row)}`, secrets: [R.receiptToken(row)] });
  const stored = (await q.get<{ body: string }>("SELECT body FROM outbox WHERE id = ?", mail))!.body;
  assert.ok(!stored.includes(token) && stored.includes(HIDDEN), "the Email log shows HIDDEN, not the link");

  await eraseSender(email);
  assert.equal(await q.get("SELECT 1 FROM tracks WHERE id = ? OR token_hash = ?", id, (await import("../src/lib/token-hash")).hashToken(token)), undefined);
});

test("nothing outside src/lib/receipt-token.ts looks up a receipt token or builds a receipt link by hand", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(__dirname, "../src"));
  // The sender's own browser builds links from tokens the server just gave it (SubmitForm), and the receipt page uses
  // the token in its own address; neither stores or looks one up.
  const allowed = [/src\/lib\/receipt-token\.ts$/, /src\/app\/\[handle\]\/SubmitForm\.tsx$/, /src\/app\/receipt\/\[token\]\//];
  const bad = files
    .filter((f) => !allowed.some((a) => a.test(f)))
    .filter((f) => /\/receipt\/\$\{|\bt\.token(_hash)? = \?|tracks WHERE token(_hash)? = \?|UPDATE tracks SET[^`"]*WHERE token(_hash)? = \?/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(bad.map((f) => path.relative(path.join(__dirname, ".."), f)), [], "go through receiptWhere / receiptUrl / receiptPath");
});
