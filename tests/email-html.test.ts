import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and a fake email provider (fetch is stubbed: nothing is sent).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-email-html-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_API_KEY = "re_test_only";
process.env.APP_URL = "https://floortest.app";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const sent: { text: string; html: string; headers?: Record<string, string> }[] = [];
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  sent.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ id: `em-${sent.length}` }), { status: 200 });
}) as typeof fetch;

const U = "https://floortest.app";
const DELIVERED = `Hi Nova,\n\n"Low Orbit" was delivered to Maxwell.\nWe'll email you when it's listened to.\n\nYour private receipt: ${U}/receipt/abc\nEverything you've sent, with what happened to each: ${U}/sent/xyz\n\n— FloorTest`;

test("the text becomes the receipt layout: headline, one button with its address written out, other links shown as addresses", async () => {
  const { emailHtml } = await import("../src/lib/email-html");
  const html = emailHtml("Delivered: Nova Rios – Low Orbit", DELIVERED, { optional: false, reserved: false });
  assert.match(html, /<h1[^>]*>Delivered: Nova Rios – Low Orbit<\/h1>/);
  assert.equal(html.match(/class="ft-btn-text"/g)?.length, 1, "one button only");
  assert.match(html, new RegExp(`<a href="${U}/receipt/abc" class="ft-btn-text"[^>]*>Your private receipt</a>`));
  assert.match(html, /Or open <a href="https:\/\/floortest\.app\/receipt\/abc"[^>]*>floortest\.app\/receipt\/abc<\/a>/);
  assert.match(html, /<a href="https:\/\/floortest\.app\/sent\/xyz"[^>]*>floortest\.app\/sent\/xyz<\/a>/, "the second link shows its own address");
  assert.doesNotMatch(html, /— FloorTest/, "the sign-off is dropped: the brand line is at the top");
  assert.equal(html.match(/<img /g)?.length, 1, "one image: the app icon");
  assert.match(html, /alt="FloorTest"/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.doesNotMatch(html.match(/<style>(.*)<\/style>/)![1].replace(/@media[^{]*\{([^{}]*\{[^}]*\})*\}/, ""), /(^|\})\.ft-/, "outside the dark media query, every dark rule is scoped to Outlook's [data-ogsc]");
  assert.ok(html.length < 100_000, "under Gmail's clipping size");
});

test("anything a sender typed is shown as text, never as HTML", async () => {
  const { emailHtml } = await import("../src/lib/email-html");
  const html = emailHtml(`Delivered: <img src=x onerror=alert(1)> – "Hit"`, `Hi <script>alert(1)</script>,\n\n"<b>Hit</b>" was delivered.\n\n— FloorTest`, { optional: false, reserved: false });
  assert.doesNotMatch(html, /<script|<b>|<img src=x/, "no raw tag from the sender survives");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("a code on its own line becomes the code block; a sentence with a link is not turned into a button", async () => {
  const { emailHtml } = await import("../src/lib/email-html");
  const code = emailHtml("482913 is your FloorTest sign-in code", "Hi Max,\n\nYour sign-in code is:\n\n482913\n\nIt works once, for 10 minutes.\n\n— FloorTest", { optional: false, reserved: true });
  assert.match(code, /class="ft-panel"[^>]*>482913<\/td>/);
  assert.match(code, /Security emails can't be turned off/);
  const welcome = emailHtml("Your link is live", `Hi Max,\n\nYour receiving link is ready: ${U}/max\n\nOn your desk:\n• Space plays\n• U undoes\n\n— FloorTest`, { optional: false, reserved: false });
  assert.doesNotMatch(welcome, /class="ft-btn-text"/, "\"Your receiving link is ready\" is a sentence, not a button label");
  assert.match(welcome, /Your receiving link is ready: <a href="https:\/\/floortest\.app\/max"/);
  assert.equal(welcome.match(/<tr><td class="ft-line ft-text"/g)?.length, 2, "the bullets become list rows");
});

test("links elsewhere never become the button", async () => {
  const { emailHtml } = await import("../src/lib/email-html");
  const html = emailHtml("Hi", "Hi,\n\nDetails: https://evil.example/login\n\n— FloorTest", { optional: false, reserved: false });
  assert.doesNotMatch(html, /class="ft-btn-text"/);
});

test("deliver sends the designed HTML next to the unchanged text, and optional mail keeps Stop these emails and the one-click header", async () => {
  const { q } = await import("../src/lib/db");
  const { sendMail } = await import("../src/lib/mail");
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('nova@x.io', 'h', 'Nova', 'nova', 'free', 'UTC', ?) RETURNING id", Date.now()))!.id;
  assert.equal(await sendMail({ userId: uid, to: "nova@x.io", subject: "Listened: Nova – Low Orbit", body: DELIVERED, unsubscribe: "alerts" }), "sent");
  const m = sent.at(-1)!;
  assert.ok(m.text.startsWith(DELIVERED), "the text part is the wording as written");
  assert.match(m.text, /Stop these emails: https:\/\/floortest\.app\/unsubscribe\//);
  assert.match(m.html, /<a href="https:\/\/floortest\.app\/unsubscribe\/[^"]+"[^>]*>Stop these emails<\/a>/);
  assert.ok(m.headers?.["List-Unsubscribe"], "the one-click unsubscribe header stays");
});
