import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";

// Terms acceptance records and the stamped PDF (Research brief, owner 15 Nov). A throwaway database, no email key.
process.env.DATA_DIR = testDataDir("ft-terms-acceptance-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL_ENV;


let n = 0;
async function user(email: string) {
  const { q, now } = await import("../src/lib/db");
  n++;
  return (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'free', 'dj', 'UTC', ?, ?) RETURNING id",
    email,
    `Person ${n}`,
    `termsuser${n}`,
    now(),
    now(),
  ))!.id;
}

/** A Terms text that isn't the current one, archived, so a stored acceptance can point at it. */
async function oldTerms() {
  const { q, now } = await import("../src/lib/db");
  const { termsHash } = await import("../src/lib/terms-record");
  const body = `Terms of Use\nLast updated 1 January 2026\n\nOld\nAn older wording ${n++}.`;
  const hash = termsHash(body);
  await q.run("INSERT INTO terms_versions (hash, version, body, created_at) VALUES (?,?,?,?) ON CONFLICT (hash) DO NOTHING", hash, "1 January 2026", body, now());
  return { version: "1 January 2026", hash, body };
}

test("the current Terms are read from the Terms page itself and archived once, by the hash of their exact text", async () => {
  const { q } = await import("../src/lib/db");
  const { currentTerms, termsHash } = await import("../src/lib/terms-record");
  const a = await currentTerms();
  const b = await currentTerms();
  assert.equal(a.hash, b.hash, "same text, same hash");
  assert.equal(a.hash, termsHash(a.body));
  assert.match(a.body, /^Terms of Use\nLast updated /);
  assert.match(a.body, /\nWho we are\n/, "the section headings are in the text");
  assert.match(a.body, /You keep all rights to your music\./, "and the paragraphs, word for word");
  const rows = await q.all<{ hash: string; body: string }>("SELECT hash, body FROM terms_versions WHERE hash = ?", a.hash);
  assert.equal(rows.length, 1, "archived once");
  assert.equal(rows[0].body, a.body, "the archive holds the exact text");
});

test("an account must tick when nothing is recorded or the Terms text changed; ticking the current text clears it", async () => {
  const { q, now } = await import("../src/lib/db");
  const { needsTermsTick, recordAcceptance, currentTerms } = await import("../src/lib/terms-record");
  const id = await user("tick-account@example.test");
  assert.equal(await needsTermsTick({ userId: id }), true, "nothing recorded yet");
  const old = await oldTerms();
  await q.run("INSERT INTO terms_acceptances (user_id, version, hash, name, accepted_at) VALUES (?,?,?,?,?)", id, old.version, old.hash, "Person", now());
  assert.equal(await needsTermsTick({ userId: id }), true, "accepted older text: asked again");
  const { row, first } = await recordAcceptance({ userId: id }, "Person One", await currentTerms());
  assert.equal(first, true);
  assert.equal(row.hash, (await currentTerms()).hash);
  assert.equal(await needsTermsTick({ userId: id }), false, "the current text is accepted");
});

test("two people: one person's acceptance never counts for another, by account or by email", async () => {
  const { recordAcceptance, needsTermsTick } = await import("../src/lib/terms-record");
  const a = await user("two-a@example.test");
  const b = await user("two-b@example.test");
  await recordAcceptance({ userId: a }, "A");
  assert.equal(await needsTermsTick({ userId: a }), false);
  assert.equal(await needsTermsTick({ userId: b }), true, "B still has to tick");
  await recordAcceptance({ email: "sender-a@example.test" }, "Sender A");
  assert.equal(await needsTermsTick({ email: "sender-a@example.test" }), false);
  assert.equal(await needsTermsTick({ email: "sender-b@example.test" }), true, "another sender still has to tick");
  assert.equal(await needsTermsTick({ email: "two-a@example.test" }), true, "an account's tick isn't a tick for its email as a sender");
});

test("a record is the account's or the email's, never both and never neither", async () => {
  const { q, now } = await import("../src/lib/db");
  const { currentTerms } = await import("../src/lib/terms-record");
  const t = await currentTerms();
  const id = await user("check-both@example.test");
  await assert.rejects(q.run("INSERT INTO terms_acceptances (user_id, email, version, hash, accepted_at) VALUES (?,?,?,?,?)", id, "x@example.test", t.version, t.hash, now()));
  await assert.rejects(q.run("INSERT INTO terms_acceptances (version, hash, accepted_at) VALUES (?,?,?)", t.version, t.hash, now()));
  await assert.rejects(q.run("INSERT INTO terms_acceptances (email, version, hash, accepted_at) VALUES (?,?,?,?)", "x@example.test", t.version, "not-archived", now()), "the text must be archived first");
});

test("the stamped PDF: name, email, UTC time and version on top, the fingerprint, then the archived text; no IP", async () => {
  const { recordAcceptance } = await import("../src/lib/terms-record");
  const { acceptedTermsPdf, stampLine, utcStamp } = await import("../src/lib/terms-pdf");
  const { row } = await recordAcceptance({ email: "pdf-sender@example.test" }, "Ama Mensah");
  const stamp = stampLine(row, "pdf-sender@example.test");
  assert.equal(stamp, `Accepted by Ama Mensah, pdf-sender@example.test, ${utcStamp(row.accepted_at)}, Terms version ${row.version}`);
  assert.match(utcStamp(Date.UTC(2026, 10, 15, 9, 4)), /^2026-11-15 09:04 UTC$/);
  const pdf = (await acceptedTermsPdf(row, "pdf-sender@example.test"))!;
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"), "a PDF");
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.ok(text.includes("(Accepted by Ama Mensah, pdf-sender@example.test"), "the stamp is in the file as text");
  assert.ok(text.includes(row.hash), "with the text's fingerprint");
  assert.ok(text.includes("(You keep all rights to your music.)") || text.includes("You keep all rights to your music."), "and the Terms themselves");
  assert.doesNotMatch(text, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "no IP address anywhere");
  // The cross-reference table points at each object: a reader can open it.
  const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.ok(text.slice(xref).startsWith("xref"));
  for (const m of text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)) assert.match(text.slice(Number(m[1]), Number(m[1]) + 12), /^\d+ 0 obj/);
});

test("the PDF writer wraps long text onto more pages and escapes what would break the file", async () => {
  const { textPdf, wrap } = await import("../src/lib/pdf-text");
  const lines = wrap("word ".repeat(400), 10, 483);
  assert.ok(lines.length > 10 && lines.every((l) => l.length > 0));
  const pdf = textPdf(Array.from({ length: 200 }, (_, i) => ({ text: `Line ${i} (with brackets) and a back\\slash “quotes” — dash` })), "T").toString("latin1");
  assert.ok(Number(/\/Count (\d+)/.exec(pdf)![1]) >= 3, "several pages");
  assert.ok(pdf.includes("\\(with brackets\\)"), "brackets escaped");
  assert.ok(pdf.includes("back\\\\slash"), "backslash escaped");
  assert.ok(pdf.includes("\\223quotes\\224"), "curly quotes as WinAnsi codes");
});

test("a sender's PDF goes on their first Delivered email per Terms version, once", async () => {
  const { q, now } = await import("../src/lib/db");
  const { recordAcceptance, pendingTermsPdf } = await import("../src/lib/terms-record");
  const email = "once@example.test";
  assert.equal(await pendingTermsPdf(email), undefined, "nothing accepted, nothing to attach");
  const { row } = await recordAcceptance({ email }, "Once");
  assert.deepEqual(await pendingTermsPdf(email), { acceptanceId: row.id, email });
  // What lib/mail.ts does when it sends: claims the copy; a second email queued meanwhile finds it claimed.
  const claim = () => q.run("UPDATE terms_acceptances SET pdf_sent_at = ? WHERE id = ? AND pdf_sent_at IS NULL", now(), row.id);
  assert.equal((await claim()).changes, 1);
  assert.equal((await claim()).changes, 0, "claimed once");
  assert.equal(await pendingTermsPdf(email), undefined, "later sends carry no copy");
});

/** The cookie a sender gets after confirming their email with a code (lib/sender-code.ts). */
function confirmedCookie(email: string) {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + 86_400_000}`;
  const mac = crypto.createHmac("sha256", process.env.APP_SECRET!).update(`confirmed:${body}`).digest("base64url");
  return `${body}.${mac}`;
}

test("sending without an account: refused with termsNeeded until the box is ticked, then the tick is recorded for that email", async () => {
  const { q } = await import("../src/lib/db");
  await user("terms-receiver@example.test");
  const handle = `termsuser${n}`;
  const { POST } = await import("../src/app/api/submit/[handle]/route");
  const email = "first-send@example.test";
  const jar: Jar = new Map([["ft_sender", confirmedCookie(email)]]);
  const body = (extra: object) => ({
    name: "First Sender",
    email,
    title: "T",
    artist: "A",
    genre: "House",
    fileName: "t.wav",
    size: 1000,
    release_status: "unsigned",
    mix_status: "mastered",
    ai_use: "none",
    sender_instagram: "@firstsender",
    ...extra,
  });
  const call = async (extra: object) => {
    const out = await inRequest(jar, "203.0.113.9", () =>
      POST(new Request(`http://localhost/api/submit/${handle}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(extra)) }), {
        params: Promise.resolve({ handle }),
      } as never),
    );
    return out.answer as Response;
  };
  const refused = await call({});
  assert.equal(refused.status, 409, JSON.stringify(await refused.clone().json()));
  const r = (await refused.json()) as { termsNeeded?: boolean; termsHash?: string };
  assert.equal(r.termsNeeded, true);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE email = ?", email), 0, "nothing recorded without the tick");
  const stale = await call({ terms_tick: true, terms_hash: "an-older-text" });
  assert.equal(stale.status, 409, "a tick for other Terms text is refused");
  const ok = await call({ terms_tick: true, terms_hash: r.termsHash });
  assert.notEqual(ok.status, 409, "ticked: past the Terms check");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE email = ?", email), 1, "recorded against the confirmed email");
  const again = await call({});
  assert.notEqual(again.status, 409, "the next send with the same Terms needs no tick");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE email = ?", email), 1, "and records nothing more");
});

test("the dashboard sends anyone who hasn't accepted the current Terms to /accept-terms, never in an admin view", async () => {
  const fs = await import("node:fs");
  const layout = fs.readFileSync(new URL("../src/app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /if \(!view && \(await needsTermsTick\(\{ userId: user\.actor_id \}\)\)\) redirect\("\/accept-terms"\);/);
  const signup = fs.readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8");
  assert.match(signup, /await recordAcceptance\(\{ userId: u\.id \}, a\.name, accepted, db\)/, "sign-up records it inside the account's transaction");
});
