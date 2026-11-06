import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testDataDir } from "./test-db";

// A throwaway local database and test-only secrets, set before the app's modules load. Nothing leaves the machine.
process.env.DATA_DIR = testDataDir("ft-email-delivery-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("test-webhook-secret-delivery-01").toString("base64")}`;
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

let n = 0;
async function report(emailId: string, type: string, bounce?: { type: string; subType?: string; message?: string }) {
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const id = `msg_${++n}`;
  const body = JSON.stringify({ type, data: { email_id: emailId, to: ["someone@x.io"], ...(bounce ? { bounce } : {}) } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("base64");
  const res = await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  assert.equal(res.status, 200);
}

async function email(providerId: string, to: string) {
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at, provider_id) VALUES (NULL, ?, 'S', 'B', 'sent', 'sender', ?, ?)", to, Date.now(), providerId);
  return async () => (await q.get<{ delivery: string; delivery_detail: string; delivered: boolean }>("SELECT delivery, delivery_detail, delivered_at IS NOT NULL AS delivered FROM outbox WHERE provider_id = ?", providerId))!;
}

const blocked = async (to: string) => {
  const { q } = await import("../src/lib/db");
  return !!(await q.get("SELECT 1 FROM email_suppressions WHERE email = ?", to));
};

test("an email that arrived stays Delivered when a bounce comes later, the reason is kept, and the address isn't blocked", async () => {
  const row = await email("em_fwd", "records@forward.io");
  await report("em_fwd", "email.delivered");
  await report("em_fwd", "email.bounced", { type: "Permanent", subType: "General", message: "550 forwarded copy rejected" });
  assert.deepEqual(await row(), { delivery: "delivered", delivery_detail: "After delivery: Bounce: General: 550 forwarded copy rejected", delivered: true });
  assert.equal(await blocked("records@forward.io"), false, "still gets email");
  // A late "delayed" never replaces it either.
  await report("em_fwd", "email.delivery_delayed");
  assert.equal((await row()).delivery, "delivered");
});

test("a soft bounce is shown as one, with its reason, and blocks nothing", async () => {
  const row = await email("em_soft", "busy@x.io");
  await report("em_soft", "email.bounced", { type: "Transient", subType: "MailboxFull", message: "452 mailbox full" });
  assert.deepEqual(await row(), { delivery: "soft_bounce", delivery_detail: "Soft bounce: MailboxFull: 452 mailbox full", delivered: false });
  assert.equal(await blocked("busy@x.io"), false);
  // If it gets through on a retry, it shows Delivered.
  await report("em_soft", "email.delivered");
  assert.equal((await row()).delivery, "delivered");
});

test("a hard bounce on an email that never arrived is Bounced and stops further email, as before", async () => {
  const row = await email("em_hard", "nobody@x.io");
  await report("em_hard", "email.bounced", { type: "Permanent", subType: "Suppressed", message: "550 no such user" });
  assert.deepEqual(await row(), { delivery: "bounced", delivery_detail: "Bounce: Suppressed: 550 no such user", delivered: false });
  assert.equal(await blocked("nobody@x.io"), true);
});

test("a spam report after delivery still counts, and still stops optional email", async () => {
  const row = await email("em_spam", "grumpy@x.io");
  await report("em_spam", "email.delivered");
  await report("em_spam", "email.complained");
  assert.equal((await row()).delivery, "complained");
  assert.equal(await blocked("grumpy@x.io"), true);
});

test("the status rule, case by case", async () => {
  const { nextDelivery } = await import("../src/lib/email-delivery");
  assert.equal(nextDelivery("", false, "delivered", false), "delivered");
  assert.equal(nextDelivery("bounced", false, "delivered", false), "delivered");
  assert.equal(nextDelivery("complained", true, "delivered", false), null);
  assert.equal(nextDelivery("", false, "delayed", false), "delayed");
  assert.equal(nextDelivery("delivered", true, "delayed", false), null);
  assert.equal(nextDelivery("soft_bounce", false, "delayed", false), null);
  assert.equal(nextDelivery("", false, "bounced", true), "soft_bounce");
  assert.equal(nextDelivery("", false, "bounced", false), "bounced");
  assert.equal(nextDelivery("delivered", true, "bounced", false), null);
  assert.equal(nextDelivery("complained", false, "bounced", false), null);
  assert.equal(nextDelivery("delivered", true, "complained", false), "complained");
});

const counts = async () => {
  const { q } = await import("../src/lib/db");
  return q.get<{ receipts: number; touched: number; blocked: number }>(
    "SELECT (SELECT COUNT(*)::int FROM webhook_receipts) AS receipts, (SELECT COUNT(*)::int FROM outbox WHERE delivery <> '' OR delivery_detail <> '') AS touched, (SELECT COUNT(*)::int FROM email_suppressions) AS blocked",
  );
};

test("a missing, wrong or forged signature is refused with 401 and changes nothing", async () => {
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  await email("em_forged", "victim@x.io");
  const before = await counts();
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "em_forged", to: ["victim@x.io"], bounce: { type: "Permanent", message: "x" } } });
  const ts = String(Math.floor(Date.now() / 1000));
  const forged = crypto.createHmac("sha256", Buffer.from("not-the-secret")).update(`msg_forged.${ts}.${body}`).digest("base64");
  const realSecret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const otherBody = crypto.createHmac("sha256", realSecret).update(`msg_forged.${ts}.{"type":"email.delivered"}`).digest("base64");
  const tries: Record<string, string>[] = [
    { "svix-id": "msg_forged", "svix-timestamp": ts },
    { "svix-id": "msg_forged", "svix-timestamp": ts, "svix-signature": "v1,AAAA" },
    { "svix-id": "msg_forged", "svix-timestamp": ts, "svix-signature": `v1,${forged}` },
    { "svix-id": "msg_forged", "svix-timestamp": ts, "svix-signature": `v1,${otherBody}` },
    { "svix-id": "msg_forged", "svix-timestamp": String(Number(ts) - 3600), "svix-signature": `v1,${crypto.createHmac("sha256", realSecret).update(`msg_forged.${Number(ts) - 3600}.${body}`).digest("base64")}` },
  ];
  for (const headers of tries) {
    const res = await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers }));
    assert.equal(res.status, 401, `refused: ${Object.keys(headers).join(", ")}`);
  }
  assert.deepEqual(await counts(), before, "no receipt, no status, no block");
  assert.equal(await blocked("victim@x.io"), false);
});

test("a signed report in the wrong shape is noted once and answered 200, changing no email or block", async () => {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  await email("em_odd", "odd@x.io");
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const incidents = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  const bad = [
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: { type: 5, message: "x" } } },
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: { type: "Permanent", message: { long: true } } } },
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: { type: "Permanent", subType: 7 } } },
    { type: "email.bounced", data: { email_id: 99, to: ["odd@x.io"] } },
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: "Permanent" } },
  ];
  for (const [i, payload] of bad.entries()) {
    const body = JSON.stringify(payload);
    const id = `msg_odd_${i}`;
    const send = () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("base64");
      return POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
    };
    const before = { ...(await counts())!, incidents: await incidents() };
    const res = await send();
    assert.equal(res.status, 200, `answered 2xx: ${body}`);
    assert.deepEqual(await res.json(), { ignored: true });
    const after = { ...(await counts())!, incidents: await incidents() };
    assert.deepEqual(after, { ...before, receipts: before.receipts + 1, incidents: before.incidents + 1 }, "noted once with an incident, nothing else");
    await send(); // a retry of the same report adds nothing
    assert.deepEqual({ ...(await counts())!, incidents: await incidents() }, after);
  }
});

test("a bad `to` doesn't stop a report whose email is found", async () => {
  const row = await email("em_badto", "found@x.io");
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "em_badto", to: [42] } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", secret).update(`msg_badto.${ts}.${body}`).digest("base64");
  await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": "msg_badto", "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  assert.equal((await row()).delivery, "delivered");
});

test("a hard bounce for an email we can't find still blocks the address it names", async () => {
  await report("em_unknown", "email.bounced", { type: "Permanent", message: "550 gone" });
  assert.equal(await blocked("someone@x.io"), true, "falls back to data.to");
});

test("an unknown event type that matches an object's built-in names is ignored", async () => {
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const body = JSON.stringify({ type: "constructor", data: { email_id: "em_x", to: ["a@x.io"] } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", secret).update(`msg_ctor.${ts}.${body}`).digest("base64");
  const res = await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": "msg_ctor", "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  assert.deepEqual(await res.json(), { ignored: true });
});

test("a very long bounce message is kept to 300 characters on the email and the block list", async () => {
  const { q } = await import("../src/lib/db");
  await email("em_long", "long@x.io");
  await report("em_long", "email.bounced", { type: "Permanent", subType: "General", message: "x".repeat(1000) });
  const row = await q.get<{ d: string }>("SELECT delivery_detail AS d FROM outbox WHERE provider_id = 'em_long'");
  const block = await q.get<{ d: string }>("SELECT detail AS d FROM email_suppressions WHERE email = 'long@x.io'");
  assert.ok(row!.d.length <= 300 && row!.d.length > 200, `email detail ${row!.d.length}`);
  assert.ok(block!.d.length <= 300, `block detail ${block!.d.length}`);
  // After delivery, the "After delivery: " note is kept to 300 too.
  const after = await email("em_long_after", "longafter@x.io");
  await report("em_long_after", "email.delivered");
  await report("em_long_after", "email.bounced", { type: "Permanent", subType: "General", message: "y".repeat(1000) });
  const d = (await after()).delivery_detail;
  assert.ok(d.startsWith("After delivery: ") && d.length === 300, `after-delivery detail ${d.length}`);
});

test("the Blocked chip matches addresses the way the block list stores them", async () => {
  const { q } = await import("../src/lib/db");
  const { normalEmail } = await import("../src/lib/email-normal");
  const raw = " Ｒecords@Forward.IO ";
  const sql = await q.get<{ v: string }>("SELECT lower(btrim(normalize(?, NFKC))) AS v", raw);
  assert.equal(sql!.v, normalEmail(raw));
});

test("a signed report that isn't readable is noted once and answered 200", async () => {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const body = "{not json";
  const send = () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac("sha256", secret).update(`msg_nojson.${ts}.${body}`).digest("base64");
    return POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": "msg_nojson", "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  };
  const incidents = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  const before = await incidents();
  const res = await send();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ignored: true });
  assert.equal(await incidents(), before + 1);
  assert.ok(await q.get("SELECT 1 FROM webhook_receipts WHERE event_id = 'msg_nojson'"));
  await send();
  assert.equal(await incidents(), before + 1, "a retry adds nothing");
});

test("an address blocked for a spam report becomes a full block when it later hard-bounces", async () => {
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO email_suppressions (email, reason, detail, created_at) VALUES ('spamthendead@x.io', 'complained', '', ?)", Date.now());
  await email("em_dead", "spamthendead@x.io");
  await report("em_dead", "email.bounced", { type: "Permanent", message: "550 mailbox gone" });
  assert.deepEqual(await q.get("SELECT reason, detail FROM email_suppressions WHERE email = 'spamthendead@x.io'"), { reason: "bounced", detail: "550 mailbox gone" });
  // A spam report never softens a bounce block.
  await email("em_dead2", "spamthendead@x.io");
  await report("em_dead2", "email.complained");
  assert.equal((await q.get<{ reason: string }>("SELECT reason FROM email_suppressions WHERE email = 'spamthendead@x.io'"))!.reason, "bounced");
});

test("the send-time block check matches an address the way the block list stores it", async () => {
  const { q } = await import("../src/lib/db");
  const { sendMail } = await import("../src/lib/mail");
  await q.run("INSERT INTO email_suppressions (email, reason, detail, created_at) VALUES ('fullwidth@x.io', 'bounced', '', ?)", Date.now());
  // A full-width "ｆ" and stray spaces: NFKC, trim and lowercase make it the stored address.
  await sendMail({ userId: null, to: " ｆullwidth@X.io ", subject: "S", body: "B" });
  const row = await q.get<{ status: string }>("SELECT status FROM outbox WHERE subject = 'S' AND to_email LIKE '%ullwidth%' ORDER BY id DESC LIMIT 1");
  assert.match(row!.status, /^skipped \(bounced/);
});

test("if the incident can't be saved, the report isn't marked seen and Resend is asked to retry; the retry records it", async () => {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const body = "{still not json";
  const send = () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac("sha256", secret).update(`msg_noinc.${ts}.${body}`).digest("base64");
    return POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": "msg_noinc", "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  };
  await q.run("ALTER TABLE incidents RENAME TO incidents_off");
  try {
    const res = await send();
    assert.equal(res.status, 500, "asks Resend to retry");
    assert.equal(await q.get("SELECT 1 FROM webhook_receipts WHERE event_id = 'msg_noinc'"), undefined, "not marked seen");
  } finally {
    await q.run("ALTER TABLE incidents_off RENAME TO incidents");
  }
  const before = (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  const res = await send();
  assert.equal(res.status, 200);
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n, before + 1, "the retry records the incident");
  assert.ok(await q.get("SELECT 1 FROM webhook_receipts WHERE event_id = 'msg_noinc'"));
});

test("the block list only ever moves from a spam block to a bounce block, never the other way or sideways", async () => {
  const { q } = await import("../src/lib/db");
  const reason = async (to: string) => q.get<{ reason: string; detail: string }>("SELECT reason, detail FROM email_suppressions WHERE email = ?", to);
  // Spam, then spam again: stays a spam block (sign-in codes keep going through).
  await email("em_c1", "twice-spam@x.io");
  await report("em_c1", "email.complained");
  await email("em_c2", "twice-spam@x.io");
  await report("em_c2", "email.complained");
  assert.equal((await reason("twice-spam@x.io"))!.reason, "complained");
  // Bounce, then bounce again: the first reason is kept.
  await email("em_b1", "twice-bounce@x.io");
  await report("em_b1", "email.bounced", { type: "Permanent", message: "first" });
  await email("em_b2", "twice-bounce@x.io");
  await report("em_b2", "email.bounced", { type: "Permanent", message: "second" });
  assert.deepEqual(await reason("twice-bounce@x.io"), { reason: "bounced", detail: "first" });
  // Bounce, then spam: stays a bounce block, with its reason.
  await email("em_bc", "bounce-then-spam@x.io");
  await report("em_bc", "email.bounced", { type: "Permanent", message: "gone" });
  await email("em_bc2", "bounce-then-spam@x.io");
  await report("em_bc2", "email.complained");
  assert.deepEqual(await reason("bounce-then-spam@x.io"), { reason: "bounced", detail: "gone" });
});

test("a spam block still lets sign-in codes and resets out, and skips only optional mail", async () => {
  const { q } = await import("../src/lib/db");
  const { sendMail } = await import("../src/lib/mail");
  await q.run("INSERT INTO email_suppressions (email, reason, detail, created_at) VALUES ('grumbly@x.io', 'complained', '', ?)", Date.now());
  await sendMail({ userId: null, to: "grumbly@x.io", subject: "Your code", body: "B" });
  await sendMail({ userId: null, to: "grumbly@x.io", subject: "Newsletter", body: "B", unsubscribe: "product" });
  const status = async (subject: string) => (await q.get<{ status: string }>("SELECT status FROM outbox WHERE to_email = 'grumbly@x.io' AND subject = ? ORDER BY id DESC LIMIT 1", subject))!.status;
  assert.doesNotMatch(await status("Your code"), /^skipped/, "required mail goes out");
  assert.match(await status("Newsletter"), /^skipped \(complained/, "optional mail is skipped");
});

test("if the block list can't be read, nothing goes out: ops are told once, retries end at the limit, and an expiring code is dropped", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver } = await import("../src/lib/mail");
  const incidents = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  const id = await queueMail({ userId: null, to: "maybe-blocked@x.io", subject: "Receipt", body: "B" });
  const code = await queueMail({ userId: null, to: "maybe-blocked@x.io", subject: "Your code", body: "123456", expires: true });
  const before = await incidents();
  await q.run("ALTER TABLE email_suppressions RENAME TO email_suppressions_off");
  try {
    for (let i = 0; i < 8; i++) {
      await q.run("UPDATE outbox SET next_at = 0 WHERE id = ? AND status = 'queued'", id);
      await deliver(id);
    }
    await deliver(code);
  } finally {
    await q.run("ALTER TABLE email_suppressions_off RENAME TO email_suppressions");
  }
  const row = await q.get<{ status: string; attempts: number; payload: string | null }>("SELECT status, attempts, payload FROM outbox WHERE id = ?", id);
  assert.deepEqual(row, { status: "failed (block check)", attempts: 5, payload: null }, "bounded by the usual limit, then closed");
  const held = await q.get<{ status: string; payload: string | null }>("SELECT status, payload FROM outbox WHERE id = ?", code);
  assert.deepEqual(held, { status: "dropped (block check failed)", payload: null }, "a code isn't held to arrive dead");
  const raised = await q.all<{ message: string }>("SELECT message FROM incidents ORDER BY id DESC LIMIT ?", (await incidents()) - before);
  assert.equal(raised.filter((r) => /block list can't be read/.test(r.message)).length, 1, "ops told once, not on every try");
  assert.ok(raised.some((r) => /failed \(block check\)/.test(r.message)), "the closed email raises its own incident");
});

test("an incident is raised only when a block is added or upgraded, not for every repeat report", async () => {
  const { q } = await import("../src/lib/db");
  const incidents = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  await email("em_rep1", "repeat@x.io");
  const a = await incidents();
  await report("em_rep1", "email.bounced", { type: "Permanent", message: "gone" });
  assert.equal(await incidents(), a + 1, "a new block");
  await email("em_rep2", "repeat@x.io");
  await report("em_rep2", "email.bounced", { type: "Permanent", message: "gone again" });
  assert.equal(await incidents(), a + 1, "already blocked: no second incident");
  await email("em_rep3", "spamonly@x.io");
  await report("em_rep3", "email.complained");
  const spam = await q.get<{ message: string }>("SELECT message FROM incidents ORDER BY id DESC LIMIT 1");
  assert.match(spam!.message, /Optional emails stop to this address; emails people need \(sign-in codes, resets, receipts\) still go/);
});

test("an expiring code is never sent late, even if its drop failed and the send is picked up again", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver, drainOutbox } = await import("../src/lib/mail");
  const id = await queueMail({ userId: null, to: "late-code@x.io", subject: "Late code", body: "654321", expires: true });
  // The block list can't be read and the drop can't be written either: deliver throws, leaving the row mid-send.
  await q.run("ALTER TABLE email_suppressions RENAME TO email_suppressions_off");
  await q.run("CREATE OR REPLACE FUNCTION test_refuse_drop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF new.status LIKE 'dropped%' THEN RAISE EXCEPTION 'refused'; END IF; RETURN new; END $$");
  await q.run("CREATE TRIGGER test_refuse_drop BEFORE UPDATE ON outbox FOR EACH ROW EXECUTE FUNCTION test_refuse_drop()");
  try {
    await assert.rejects(deliver(id));
  } finally {
    await q.run("DROP TRIGGER test_refuse_drop ON outbox");
    await q.run("ALTER TABLE email_suppressions_off RENAME TO email_suppressions");
  }
  assert.equal((await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", id))!.status, "sending");
  // Everything recovers; the send is now old (15 minutes) and stale, so the queue picks it up again.
  await q.run("UPDATE outbox SET created_at = created_at - 15 * 60000, last_attempt_at = last_attempt_at - 15 * 60000 WHERE id = ?", id);
  await drainOutbox(50);
  const row = await q.get<{ status: string; payload: string | null }>("SELECT status, payload FROM outbox WHERE id = ?", id);
  assert.deepEqual(row, { status: "dropped (expired)", payload: null }, "dropped unsent, never logged or sent");
  const { codeMailProblem } = await import("../src/lib/code-mail");
  assert.match(codeMailProblem("dropped (expired)") ?? "", /Ask for a new one/);
});
