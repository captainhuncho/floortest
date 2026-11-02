import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-receipt-token-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("a receipt token finds its track, a wrong or overlong one finds nothing, and links are built in one place", async () => {
  const { q } = await import("../src/lib/db");
  const { findByReceiptToken, receiptWhere, receiptPath, receiptUrl } = await import("../src/lib/receipt-token");
  const { APP_URL } = await import("../src/lib/mail");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('rt@x.io','h','R','rtdesk','pro','UTC',?) RETURNING id", t))!.id;
  const sid = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, 'tok-abc', 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id",
    uid, sid, t,
  ))!.id;

  assert.deepEqual(await findByReceiptToken("tok-abc"), { id });
  assert.equal(await findByReceiptToken("tok-abd"), undefined);
  assert.equal(await findByReceiptToken(`tok-abc${"x".repeat(200)}`), undefined, "overlong input is cut, not matched whole");
  assert.equal(receiptWhere("x".repeat(500)).args[0], "x".repeat(100));
  assert.equal(receiptPath({ token: "tok-abc" }), "/receipt/tok-abc");
  assert.equal(receiptUrl({ token: "tok-abc" }), `${APP_URL}/receipt/tok-abc`);
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
    .filter((f) => /\/receipt\/\$\{|\bt\.token = \?|tracks WHERE token = \?|UPDATE tracks SET[^`"]*WHERE token = \?/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(bad.map((f) => path.relative(path.join(__dirname, ".."), f)), [], "go through receiptWhere / receiptUrl / receiptPath");
});
