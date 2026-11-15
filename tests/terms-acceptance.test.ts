import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";

// Terms acceptance records and the stamped PDF (Research brief, owner 15 Nov). A throwaway database, no email key.
process.env.DATA_DIR = testDataDir("ft-terms-acceptance-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "ops-admin@example.test";
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
  await q.run("INSERT INTO terms_acceptances (kind, user_id, email, version, hash, name, accepted_at) VALUES ('account',?,?,?,?,?,?)", id, "tick-account@example.test", old.version, old.hash, "Person", now());
  assert.equal(await needsTermsTick({ userId: id }), true, "accepted older text: asked again");
  const { row, first } = await recordAcceptance({ userId: id, email: "tick-account@example.test" }, "Person One", await currentTerms());
  assert.equal(first, true);
  assert.equal(row.hash, (await currentTerms()).hash);
  assert.equal(await needsTermsTick({ userId: id }), false, "the current text is accepted");
});

test("two people: one person's acceptance never counts for another, by account or by email", async () => {
  const { recordAcceptance, needsTermsTick } = await import("../src/lib/terms-record");
  const a = await user("two-a@example.test");
  const b = await user("two-b@example.test");
  await recordAcceptance({ userId: a, email: "two-a@example.test" }, "A");
  assert.equal(await needsTermsTick({ userId: a }), false);
  assert.equal(await needsTermsTick({ userId: b }), true, "B still has to tick");
  await recordAcceptance({ email: "sender-a@example.test" }, "Sender A");
  assert.equal(await needsTermsTick({ email: "sender-a@example.test" }), false);
  assert.equal(await needsTermsTick({ email: "sender-b@example.test" }), true, "another sender still has to tick");
  assert.equal(await needsTermsTick({ email: "two-a@example.test" }), true, "an account's tick isn't a tick for its email as a sender");
});

test("a record is an account's or a sender's: a sender row never points at an account, and every row keeps its email", async () => {
  const { q, now } = await import("../src/lib/db");
  const { currentTerms } = await import("../src/lib/terms-record");
  const t = await currentTerms();
  const id = await user("check-both@example.test");
  await assert.rejects(q.run("INSERT INTO terms_acceptances (kind, user_id, email, version, hash, accepted_at) VALUES ('sender',?,?,?,?,?)", id, "x@example.test", t.version, t.hash, now()));
  await assert.rejects(q.run("INSERT INTO terms_acceptances (kind, user_id, version, hash, accepted_at) VALUES ('account',?,?,?,?)", id, t.version, t.hash, now()), "no email, no proof");
  await assert.rejects(q.run("INSERT INTO terms_acceptances (kind, email, version, hash, accepted_at) VALUES ('sender',?,?,?,?)", "x@example.test", t.version, "not-archived", now()), "the text must be archived first");
});

test("proof outlives the account: kept 6 years after the account is deleted, then deleted; senders' 6 years after the tick", async () => {
  const { q } = await import("../src/lib/db");
  const { recordAcceptance, latestAcceptance } = await import("../src/lib/terms-record");
  const { purgeTermsProof, yearsBefore } = await import("../src/lib/retention");
  const id = await user("leaving@example.test");
  const { row } = await recordAcceptance({ userId: id, email: "leaving@example.test" }, "Leaving Person");
  await q.run("DELETE FROM users WHERE id = ?", id);
  const kept = await q.get<{ user_id: number | null; email: string; name: string; account_deleted_at: number | null }>("SELECT user_id, email, name, account_deleted_at FROM terms_acceptances WHERE id = ?", row.id);
  assert.deepEqual({ ...kept, account_deleted_at: null }, { user_id: null, email: "leaving@example.test", name: "Leaving Person", account_deleted_at: null }, "the account goes, the proof stays");
  assert.equal(await latestAcceptance({ email: "leaving@example.test" }), undefined, "an old account's tick isn't a sender's tick");
  const deletedAt = Date.UTC(2026, 10, 15);
  const until = Date.now() + 60_000;
  await purgeTermsProof(deletedAt, until);
  assert.equal((await q.get<{ a: number }>("SELECT account_deleted_at AS a FROM terms_acceptances WHERE id = ?", row.id))!.a, deletedAt, "the clean-up stamps the deletion");
  await purgeTermsProof(yearsBefore(deletedAt, -6) - 1, until);
  assert.ok(await q.get("SELECT id FROM terms_acceptances WHERE id = ?", row.id), "a day short of 6 years: kept");
  await purgeTermsProof(yearsBefore(deletedAt, -6) + 1, until);
  assert.equal(await q.get("SELECT id FROM terms_acceptances WHERE id = ?", row.id), undefined, "6 years after deletion: gone");

  const stays = await user("staying@example.test");
  const { row: live } = await recordAcceptance({ userId: stays, email: "staying@example.test" }, "Staying");
  await q.run("UPDATE terms_acceptances SET accepted_at = ? WHERE id = ?", Date.UTC(2010, 0, 1), live.id);
  const { row: sender } = await recordAcceptance({ email: "old-sender@example.test" }, "Old Sender");
  const tick = Date.UTC(2026, 0, 10);
  await q.run("UPDATE terms_acceptances SET accepted_at = ? WHERE id = ?", tick, sender.id);
  await purgeTermsProof(yearsBefore(tick, -6) - 1, until);
  assert.ok(await q.get("SELECT id FROM terms_acceptances WHERE id = ?", sender.id), "a sender's tick: kept until 6 years");
  await purgeTermsProof(yearsBefore(tick, -6) + 1, until);
  assert.equal(await q.get("SELECT id FROM terms_acceptances WHERE id = ?", sender.id), undefined, "then gone");
  assert.ok(await q.get("SELECT id FROM terms_acceptances WHERE id = ?", live.id), "a live account's tick is never cleaned up, however old");
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
  // What lib/mail.ts does once the email carrying it is accepted: marks it sent (the claim itself is in terms-mail.test.ts).
  await q.run("UPDATE terms_acceptances SET pdf_sent_at = ? WHERE id = ?", now(), row.id);
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
  const noHash = await call({ terms_tick: true });
  assert.equal(noHash.status, 409, "a tick without the hash of the text shown is refused");
  const forged = await inRequest(new Map([["ft_sender", confirmedCookie(email).replace(/.$/, (c) => (c === "A" ? "B" : "A"))]]), "203.0.113.9", () =>
    POST(new Request(`http://localhost/api/submit/${handle}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body({ terms_tick: true, terms_hash: r.termsHash })) }), {
      params: Promise.resolve({ handle }),
    } as never),
  );
  assert.equal((forged.answer as Response).status, 401, "a forged confirmation cookie records nothing");
  const ok = await call({ terms_tick: true, terms_hash: r.termsHash });
  assert.notEqual(ok.status, 409, "ticked: past the Terms check");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE email = ?", email), 1, "recorded against the confirmed email");
  const again = await call({});
  assert.notEqual(again.status, 409, "the next send with the same Terms needs no tick");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE email = ?", email), 1, "and records nothing more");
});

/** A browser signed in as this person (a real session row and cookie). */
async function signedIn(id: number): Promise<Jar> {
  const { createSession } = await import("../src/lib/auth");
  const jar: Jar = new Map();
  await inRequest(jar, "10.7.0.1", () => createSession(id));
  return jar;
}

/** The same browser with an ops admin's live "view as" ticket on this person's desk. */
async function viewingAsAdmin(jar: Jar, target: number) {
  const { q, now } = await import("../src/lib/db");
  const { signViewAs, VIEW_AS_COOKIE } = await import("../src/lib/auth");
  const admin = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_enabled_at) VALUES ('ops-admin@example.test','h','Ops','opsadmin','free','dj','UTC',?,?,?) ON CONFLICT (email) DO UPDATE SET name = 'Ops' RETURNING id",
    now(), now(), now(),
  ))!.id;
  const token = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hash, admin, now(), now(), now() + 3_600_000);
  jar.set(VIEW_AS_COOKIE, signViewAs(admin, target, hash, process.env.APP_SECRET!));
}

const tickForm = (hash: string) => {
  const f = new FormData();
  f.set("tick", "on");
  f.set("version", hash);
  return f;
};

test("accepting on /accept-terms is refused in an admin's view of someone's desk, and records nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { currentTerms } = await import("../src/lib/terms-record");
  const { acceptTerms } = await import("../src/app/(auth)/accept-terms/actions");
  const id = await user("viewed@example.test");
  const jar = await signedIn(id);
  await viewingAsAdmin(jar, id);
  const out = await inRequest(jar, "10.7.0.2", async () => acceptTerms(undefined, tickForm((await currentTerms()).hash)));
  assert.deepEqual(out.answer, { error: "Only the person can accept the Terms, not an admin view." });
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE user_id = ?", id), 0);
});

test("on a team desk, accepting records the person signed in and their own email, never the team account's", async () => {
  const { q } = await import("../src/lib/db");
  const { currentTerms } = await import("../src/lib/terms-record");
  const { DESK_COOKIE } = await import("../src/lib/auth");
  const { acceptTerms } = await import("../src/app/(auth)/accept-terms/actions");
  const team = await user("label-team@example.test");
  const mate = await user("teammate@example.test");
  const jar = await signedIn(mate);
  jar.set(DESK_COOKIE, String(team)); // working on the team's desk
  const out = await inRequest(jar, "10.7.0.3", async () => acceptTerms(undefined, tickForm((await currentTerms()).hash)), { dropAfter: true });
  assert.equal(out.redirect, "/dashboard/floor");
  const rows = await q.all<{ user_id: number; email: string }>("SELECT user_id, email FROM terms_acceptances WHERE user_id IN (?, ?)", team, mate);
  assert.deepEqual(rows.map((r) => [Number(r.user_id), r.email]), [[mate, "teammate@example.test"]]);
  // A stale page (Terms changed while it was open) records nothing.
  const stale = await inRequest(jar, "10.7.0.3", () => acceptTerms(undefined, tickForm("0".repeat(64))), { dropAfter: true });
  assert.match(String((stale.answer as { error?: string })?.error), /changed while this page was open/);
});

test("the desk sends someone who hasn't accepted the current Terms to /accept-terms, but never in an admin view", async () => {
  const { currentTerms, deskNeedsTerms, recordAcceptance } = await import("../src/lib/terms-record");
  const id = await user("fresh-desk@example.test");
  assert.equal(await deskNeedsTerms(false, id), true, "no tick yet: asked");
  assert.equal(await deskNeedsTerms(true, id), false, "an admin's view never asks");
  await recordAcceptance({ userId: id, email: "fresh-desk@example.test" }, "Fresh", await currentTerms());
  assert.equal(await deskNeedsTerms(false, id), false, "ticked the current text: straight in");
  // The layout itself pulls in client components, so its one call is pinned here.
  const fs = await import("node:fs");
  const layout = fs.readFileSync(new URL("../src/app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /if \(await deskNeedsTerms\(!!view, user\.actor_id\)\) redirect\("\/accept-terms"\);/);
});

test("sign-up records the tick inside the account's own transaction", async () => {
  // The sign-up action needs the bot check and mail; its call is pinned here, the record itself is tested above.
  const fs = await import("node:fs");
  const signup = fs.readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8");
  assert.match(signup, /await recordAcceptance\(\{ userId: u\.id, email: a\.email \}, a\.name, accepted, db\)/);
});

test("ticking the same text again adds no row and no copy; a changed text gets its own row", async () => {
  const { q } = await import("../src/lib/db");
  const { recordAcceptance } = await import("../src/lib/terms-record");
  const id = await user("twice@example.test");
  const a = await recordAcceptance({ userId: id, email: "twice@example.test" }, "Twice");
  const b = await recordAcceptance({ userId: id, email: "twice@example.test" }, "Twice");
  assert.equal(a.added, true);
  assert.equal(b.added, false, "a resubmitted form adds nothing");
  assert.equal(b.row.id, a.row.id);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM terms_acceptances WHERE user_id = ?", id), 1);
});

test("a sender's form state: told only for a confirmed email, and whether the Terms were updated since their last tick", async () => {
  const { q, now } = await import("../src/lib/db");
  const { GET } = await import("../src/app/api/sender-code/route");
  const { senderTermsState } = await import("../src/lib/terms-record");
  const email = "state@example.test";
  const ask = async (jar: Jar) => (await inRequest(jar, "203.0.113.10", () => GET(new Request(`http://localhost/api/sender-code?email=${email}`)))).answer as Response;
  const stranger = (await (await ask(new Map())).json()) as Record<string, unknown>;
  assert.deepEqual(stranger, { confirmed: false }, "an unconfirmed browser learns nothing about the Terms");
  const mine = (await (await ask(new Map([["ft_sender", confirmedCookie(email)]]))).json()) as Record<string, unknown>;
  assert.equal(mine.termsNeeded, true);
  assert.equal(mine.termsUpdated, false, "a first send isn't an update");
  const old = await oldTerms();
  await q.run("INSERT INTO terms_acceptances (kind, email, version, hash, name, accepted_at) VALUES ('sender',?,?,?,?,?)", email, old.version, old.hash, "S", now());
  assert.equal((await senderTermsState(email)).termsUpdated, true, "ticked older text: the form says Updated");
});

test("names that would break a PDF are written as text", async () => {
  const { textPdf } = await import("../src/lib/pdf-text");
  const pdf = textPdf([{ text: "Accepted by ) Tj /X \\ ( Ünïcødé 名前\nnext" }], "T").toString("latin1");
  assert.ok(pdf.includes("(Accepted by \\) Tj /X \\\\ \\( "), "brackets and backslashes escaped");
  assert.doesNotMatch(pdf.split("stream")[1].split("endstream")[0], /(?<!\\)\) Tj \/X/, "no operator escapes the string");
  assert.ok(/^startxref/m.test(pdf));
});

test("the person role can't read or write either table: only the app touches proof", async () => {
  const { q, asPerson, now } = await import("../src/lib/db");
  const id = await user("nosy@example.test");
  await assert.rejects(asPerson(id, () => q.all("SELECT id FROM terms_acceptances")));
  await assert.rejects(asPerson(id, () => q.all("SELECT hash FROM terms_versions")));
  await assert.rejects(asPerson(id, () => q.run("INSERT INTO terms_versions (hash, version, body, created_at) VALUES ('x','x','x',?)", now())));
});
