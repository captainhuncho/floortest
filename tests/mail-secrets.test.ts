import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = testDataDir("ft-mail-secrets-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("emails with sign-in codes or private links are stored with them hidden", async () => {
  const { q } = await import("../src/lib/db");
  const { sendMail, HIDDEN } = await import("../src/lib/mail");
  await sendMail({ userId: null, audience: "receiver", to: "r@x.io", secrets: ["123456"], subject: "123456 is your FloorTest sign-in code", body: "Your sign-in code is:\n\n123456\n" });
  await sendMail({ userId: null, audience: "sender", to: "s@x.io", secrets: ["tok_ABCdef-123"], subject: "Delivered", body: "Your private receipt: https://floortest.app/receipt/tok_ABCdef-123" });
  await sendMail({ userId: null, audience: "sender", to: "n@x.io", subject: "Plain", body: "Nothing secret, 123456 stays." });
  const rows = await q.all<{ to_email: string; subject: string; body: string }>("SELECT to_email, subject, body FROM outbox ORDER BY id");
  assert.equal(rows[0].subject, `${HIDDEN} is your FloorTest sign-in code`);
  assert.ok(!rows[0].body.includes("123456") && rows[0].body.includes(HIDDEN));
  assert.ok(!rows[1].body.includes("tok_ABCdef-123") && rows[1].body.endsWith(`/receipt/${HIDDEN}`));
  assert.equal(rows[2].body, "Nothing secret, 123456 stays.", "emails without secrets are stored as sent");
});

test("the outbox migration hides codes and links in emails stored before the fix", async () => {
  const { q } = await import("../src/lib/db");
  const { MIGRATIONS } = await import("../src/lib/db/migrations");
  const { HIDDEN } = await import("../src/lib/mail");
  const t = Date.now();
  const add = (subject: string, body: string) =>
    q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (NULL, 'o@x.io', ?, ?, 'logged', 'receiver', ?)", subject, body, t);
  await q.run("DELETE FROM outbox");
  await add("654321 is your FloorTest sign-in code", "Hi Ama,\n\nYour sign-in code is:\n\n654321\n\nIt works once.");
  await add("Reset your FloorTest password", "Use this link:\nhttps://floortest.app/reset/AbC_123-xyz\n\nIgnore otherwise.");
  await add("Delivered", "Your private receipt: https://floortest.app/receipt/R3c-eipt_tok\nEverything: https://floortest.app/sent");
  await add("[Staging → a@x.io] 111222 is your FloorTest code", "Your code to confirm your email and send your music:\n\n111222\n");
  await add("Welcome", "Track 123456 of the release, see https://floortest.app/dashboard");
  await q.run("UPDATE incidents SET detail = detail WHERE 1 = 0"); // table exists
  const m = MIGRATIONS.find((x) => x.id === "0091_outbox_hide_secrets")!;
  for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
  const rows = await q.all<{ subject: string; body: string }>("SELECT subject, body FROM outbox ORDER BY id");
  assert.equal(rows[0].subject, `${HIDDEN} is your FloorTest sign-in code`);
  assert.ok(!rows[0].body.includes("654321"));
  assert.ok(rows[1].body.includes(`/reset/${HIDDEN}`) && !rows[1].body.includes("AbC_123-xyz"));
  assert.ok(rows[2].body.includes(`/receipt/${HIDDEN}`) && rows[2].body.endsWith("https://floortest.app/sent"));
  assert.equal(rows[3].subject, `[Staging → a@x.io] ${HIDDEN} is your FloorTest code`);
  assert.ok(!rows[3].body.includes("111222"));
  assert.equal(rows[4].body, "Track 123456 of the release, see https://floortest.app/dashboard", "ordinary text is left alone");
});
