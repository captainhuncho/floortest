import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-sender-link-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("the /sent link carries no email, is stored as a hash and can be ended early", async () => {
  const { q } = await import("../src/lib/db");
  const { createSenderLink, readSenderLink, revokeSenderLink } = await import("../src/lib/senderLink");
  const email = "dj.someone@x.io";
  const link = await createSenderLink(email);
  assert.ok(!link.includes(Buffer.from(email).toString("base64url")) && !link.includes("@"), "no email in the URL");
  assert.match(link, /^[A-Za-z0-9_-]{32,}$/, "an opaque id");
  assert.ok(!(await q.get("SELECT 1 FROM sender_links WHERE id_hash = ?", link)), "only its hash is stored");
  assert.equal(await readSenderLink(link), email);
  assert.equal(await readSenderLink("made-up-link-made-up-link-made-up"), null);

  await revokeSenderLink(link);
  assert.equal(await readSenderLink(link), null, "ended: refused");

  const late = await createSenderLink(email);
  await q.run("UPDATE sender_links SET expires_at = ? WHERE email = ?", Date.now() - 1, email);
  assert.equal(await readSenderLink(late), null, "expired: refused");
});

test("old links with the email in them are refused, even with a valid signature", async () => {
  const { readSenderLink } = await import("../src/lib/senderLink");
  const body = `${Buffer.from("old@x.io").toString("base64url")}.${Date.now() + 3_600_000}`;
  const old = `${body}.${crypto.createHmac("sha256", process.env.APP_SECRET!).update(`sent:${body}`).digest("base64url")}`;
  assert.equal(await readSenderLink(old), null);
});
