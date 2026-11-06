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

test("a signed report with the wrong types is refused with 400 and changes nothing, instead of crashing", async () => {
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  await email("em_odd", "odd@x.io");
  const before = await counts();
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const bad = [
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: { type: 5, message: "x" } } },
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: { type: "Permanent", message: { long: true } } } },
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: { type: "Permanent", subType: 7 } } },
    { type: "email.bounced", data: { email_id: "em_odd", to: [42], bounce: { type: "Permanent" } } },
    { type: "email.bounced", data: { email_id: 99, to: ["odd@x.io"] } },
    { type: "email.bounced", data: { email_id: "em_odd", to: ["odd@x.io"], bounce: "Permanent" } },
  ];
  for (const [i, payload] of bad.entries()) {
    const body = JSON.stringify(payload);
    const id = `msg_odd_${i}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("base64");
    const res = await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
    assert.equal(res.status, 400, `refused: ${body}`);
  }
  assert.deepEqual(await counts(), before);
});

test("a very long bounce message is kept to 300 characters on the email and the block list", async () => {
  const { q } = await import("../src/lib/db");
  await email("em_long", "long@x.io");
  await report("em_long", "email.bounced", { type: "Permanent", subType: "General", message: "x".repeat(1000) });
  const row = await q.get<{ d: string }>("SELECT delivery_detail AS d FROM outbox WHERE provider_id = 'em_long'");
  const block = await q.get<{ d: string }>("SELECT detail AS d FROM email_suppressions WHERE email = 'long@x.io'");
  assert.ok(row!.d.length <= 300 && row!.d.length > 200, `email detail ${row!.d.length}`);
  assert.ok(block!.d.length <= 300, `block detail ${block!.d.length}`);
});
