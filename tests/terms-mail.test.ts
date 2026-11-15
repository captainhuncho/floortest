import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// The stamped Terms copy through the real send path (lib/mail.ts deliver), with the email provider stubbed.
process.env.DATA_DIR = testDataDir("ft-terms-mail-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

type Sent = { to: string; attachments?: { filename: string; content: string }[] };
const tries: Sent[] = [];
let answer = 200;
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  tries.push(JSON.parse(String(init?.body)) as Sent);
  return new Response(JSON.stringify({ id: `em-${tries.length}` }), { status: answer });
}) as typeof fetch;

const pdfOf = (s: Sent) => s.attachments?.[0]?.content;

test("a failed send keeps the copy for the retry, which carries the same PDF; once sent, later emails carry none", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver } = await import("../src/lib/mail");
  const { recordAcceptance, pendingTermsPdf } = await import("../src/lib/terms-record");
  const email = "retry@example.test";
  const { row } = await recordAcceptance({ email }, "Retry Sender");
  const id = await queueMail({ userId: null, to: email, subject: "Delivered", body: "b", termsPdf: await pendingTermsPdf(email) });
  answer = 500;
  assert.equal(await deliver(id), "queued (retrying)");
  const first = tries.at(-1)!;
  assert.ok(pdfOf(first), "the first try carried the copy");
  assert.equal((await q.get<{ s: number | null }>("SELECT pdf_sent_at AS s FROM terms_acceptances WHERE id = ?", row.id))!.s, null, "not marked sent after a failure");
  answer = 200;
  await q.run("UPDATE outbox SET next_at = 0 WHERE id = ?", id); // the retry is due
  assert.equal(await deliver(id), "sent");
  assert.equal(pdfOf(tries.at(-1)!), pdfOf(first), "the retry carries the same bytes (same idempotent body)");
  assert.ok((await q.get<{ s: number | null }>("SELECT pdf_sent_at AS s FROM terms_acceptances WHERE id = ?", row.id))!.s, "marked sent once accepted");
  assert.equal(await pendingTermsPdf(email), undefined);
  const later = await queueMail({ userId: null, to: email, subject: "Delivered again", body: "b", termsPdf: { acceptanceId: row.id, email } });
  assert.equal(await deliver(later), "sent");
  assert.equal(pdfOf(tries.at(-1)!), undefined, "the copy goes once");
});

test("a copy is attached only to the person who accepted, never to another recipient", async () => {
  const { queueMail, deliver } = await import("../src/lib/mail");
  const { recordAcceptance } = await import("../src/lib/terms-record");
  const { row } = await recordAcceptance({ email: "owner-of-copy@example.test" }, "Owner");
  const id = await queueMail({ userId: null, to: "someone-else@example.test", subject: "Delivered", body: "b", termsPdf: { acceptanceId: row.id, email: "owner-of-copy@example.test" } });
  assert.equal(await deliver(id), "sent", "the email itself still goes");
  assert.equal(pdfOf(tries.at(-1)!), undefined);
});

test("a successful send logs no rejection, with or without a copy (Safety H1)", async () => {
  const { queueMail, deliver } = await import("../src/lib/mail");
  const { recordAcceptance, pendingTermsPdf } = await import("../src/lib/terms-record");
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  try {
    answer = 200;
    const plain = await queueMail({ userId: null, to: "plain@example.test", subject: "Hello", body: "b" });
    assert.equal(await deliver(plain), "sent");
    await recordAcceptance({ email: "withcopy@example.test" }, "With Copy");
    const withCopy = await queueMail({ userId: null, to: "withcopy@example.test", subject: "Delivered", body: "b", termsPdf: await pendingTermsPdf("withcopy@example.test") });
    assert.equal(await deliver(withCopy), "sent");
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged.filter((l) => l.includes("Resend rejected")), []);
});

test("two ticks of the same text at once record one row (lock on the person)", async () => {
  const { q } = await import("../src/lib/db");
  const { recordAcceptance } = await import("../src/lib/terms-record");
  const email = "twice@example.test";
  const results = await Promise.all([recordAcceptance({ email }, "Twice"), recordAcceptance({ email }, "Twice")]);
  assert.equal(results.filter((r) => r.added).length, 1);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE email = ?", email), 1);
});

test("two emails claiming one copy: only the first carries it, and a finally failed email lets it go", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver, termsAttachment } = await import("../src/lib/mail");
  const { recordAcceptance } = await import("../src/lib/terms-record");
  const email = "race@example.test";
  const { row } = await recordAcceptance({ email }, "Race");
  const t = { acceptanceId: row.id, email };
  const a = await queueMail({ userId: null, to: email, subject: "Delivered 1", body: "b", termsPdf: t });
  const b = await queueMail({ userId: null, to: email, subject: "Delivered 2", body: "b", termsPdf: t });
  const [pa, pb] = await Promise.all([termsAttachment(t, email, a), termsAttachment(t, email, b)]);
  assert.equal(pa.length + pb.length, 1, "one email holds the copy");
  const holder = pa.length ? a : b;
  const other = holder === a ? b : a;
  assert.equal((await termsAttachment(t, email, holder)).length, 1, "the holder's retry carries it again");
  // The holder finally fails: the copy is let go and the other email can take it.
  answer = 500;
  assert.match(await deliver(holder, { retry: false }), /^failed/);
  answer = 200;
  assert.equal((await q.get<{ o: number | null }>("SELECT pdf_outbox_id AS o FROM terms_acceptances WHERE id = ?", row.id))!.o, null);
  assert.equal(await deliver(other), "sent");
  assert.ok(pdfOf(tries.at(-1)!), "the other email carried the copy");
  assert.ok((await q.get<{ s: number | null }>("SELECT pdf_sent_at AS s FROM terms_acceptances WHERE id = ?", row.id))!.s);
});

test("copies to one address are capped at 3 a day, whatever asks for them", async () => {
  const { q } = await import("../src/lib/db");
  const { termsPdfMail } = await import("../src/lib/terms-mail");
  const { recordAcceptance } = await import("../src/lib/terms-record");
  const { row } = await recordAcceptance({ email: "capped@example.test" }, "Capped");
  for (let i = 0; i < 5; i++) await termsPdfMail({ userId: null, email: "capped@example.test", name: "Capped", acceptanceId: row.id });
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE lower(to_email) = ?", "capped@example.test"), 3);
});
