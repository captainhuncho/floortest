import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and a fake email provider that answers only when the test lets it (nothing is sent).
process.env.DATA_DIR = testDataDir("ft-email-after-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const sent: string[] = [];
let open!: () => void;
const gate = new Promise<void>((r) => (open = r));
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  await gate;
  sent.push(JSON.parse(String(init?.body)).to);
  return new Response(JSON.stringify({ id: `em-${sent.length}` }), { status: 200 });
}) as typeof fetch;

const settle = async (q: { count: (sql: string) => Promise<number> }) => {
  for (let i = 0; i < 200 && (await q.count("SELECT COUNT(*) AS n FROM outbox WHERE status IN ('queued', 'sending')")) > 0; i++) await new Promise((r) => setTimeout(r, 25));
};

test("the /sent link and newsletter sign-up answer before any email work, whoever the address belongs to", async () => {
  const { q } = await import("../src/lib/db");
  const { sendSenderLinkLater } = await import("../src/lib/senderLink");
  const { subscribe, subscribeLater } = await import("../src/lib/newsletter");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('desk@x.io','h','Desk','desk','pro','UTC',?,?) RETURNING id", t, t))!.id;
  await q.run("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'known@x.io', 'Known', ?)", desk, t);
  await q.run("INSERT INTO newsletter_subscribers (email, token, marketing, source, created_at, confirmed_at) VALUES ('fan@x.io', 'tok-fan-xxxxxxxx', 0, '', ?, ?)", t, t);

  // The provider hasn't answered yet: had any of these waited for an email, the test would hang here.
  assert.equal(sendSenderLinkLater("known@x.io"), undefined);
  assert.equal(sendSenderLinkLater("nobody@x.io"), undefined);
  assert.equal(subscribeLater("fan@x.io", false, "footer"), undefined, "already confirmed");
  assert.equal(subscribeLater("new@x.io", false, "footer"), undefined);
  assert.equal(sent.length, 0);

  open();
  await new Promise((r) => setTimeout(r, 50));
  await settle(q);
  assert.deepEqual(sent.sort(), ["known@x.io", "new@x.io"], "only a past sender and a new sign-up get an email");
  await subscribe("fan@x.io", false, "footer");
  assert.equal(sent.length, 2, "a confirmed subscriber gets nothing new");
});
