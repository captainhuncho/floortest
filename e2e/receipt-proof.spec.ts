import fs from "node:fs";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, hydrated, test, wav } from "./fixtures";
import { LINKS } from "./link-pages-data";

/**
 * Receipt Option B (owner, 2 Nov; Safety's conditions). With the link alone a receipt shows only what happened and when,
 * and the sender's email masked: no track, receiver, callout or played-out note, in the HTML or in the data React
 * loads with it. "Show my details" emails a code to the sender's own address; the right code shows everything and
 * this browser stays revealed for 30 days. Another sender's proof opens nothing, and receipt actions without proof are
 * refused on the server. Sending from a browser proves it for that receipt straight away.
 * Data: scripts/seed.ts (SEED_LINK_PAGES), e2e/link-pages-data.ts. Codes: the fake inbox, e2e/fake-mail.mjs.
 */
const MAIL = `http://127.0.0.1:${Number(process.env.E2E_MAIL_PORT || 3212)}/mail`;
const RECEIPT = `/receipt/${LINKS.receiptToken}`;
const PRIVATE = [LINKS.sender.title, LINKS.sender.artist, LINKS.desk.name, LINKS.collection, LINKS.playedOutNote, LINKS.sender.email];

/** The newest code emailed to this address after `since`. */
async function codeFor(request: APIRequestContext, email: string, since: number) {
  let code = "";
  await expect
    .poll(async () => {
      const box = (await (await request.get(`${MAIL}?to=${encodeURIComponent(email)}`)).json()) as { body: string; at: number }[];
      code = box.filter((m) => m.at >= since).at(-1)?.body.match(/\b(\d{6})\b/)?.[1] ?? "";
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code;
}

/** Asks for a code on the open receipt, reads it from the inbox and enters it. */
async function proveWithCode(page: Page, email: string, masked: string) {
  const since = Date.now() - 1000;
  const ask = page.getByRole("button", { name: "Show my details" });
  await hydrated(ask);
  await ask.click();
  await expect(page.getByRole("status").filter({ hasText: `We sent a code to ${masked}` })).toBeVisible();
  await page.getByLabel("6-digit code").fill(await codeFor(page.request, email, since));
  await page.getByRole("button", { name: "Show my details" }).click();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "ft_consent", value: "rejected", url: test.info().project.use.baseURL ?? "http://localhost:3210" }]);
  return context.newPage();
}

test.describe("receipt details need proof", () => {
  test("with the link alone: status, dates and the masked email only, in the HTML and the RSC data", async ({ page }) => {
    const html = await (await page.request.get(RECEIPT)).text();
    const rsc = await (await page.request.get(RECEIPT, { headers: { RSC: "1" } })).text();
    for (const body of [html, rsc]) for (const secret of PRIVATE) expect(body, secret).not.toContain(secret);
    await page.goto(RECEIPT);
    await expect(page.getByRole("heading", { level: 1, name: "The receiver played it out." })).toBeVisible();
    await expect(page.getByText("Played out", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(LINKS.sender.masked).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop private sharing" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Send another/ })).toHaveCount(0);
  });

  test("the live status still answers without proof, with status only", async ({ page }) => {
    const res = await page.request.get(`/api/pulse/receipt/${LINKS.receiptToken}`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    for (const secret of PRIVATE) expect(text).not.toContain(secret);
  });

  test("stems without proof get the unknown-link answer", async ({ page }) => {
    const mine = await page.request.post(`/api/stems/${LINKS.receiptToken}`, { data: { fileName: "bass.wav", size: 1000 } });
    const unknown = await page.request.post("/api/stems/notarealtoken000", { data: { fileName: "bass.wav", size: 1000 } });
    expect(mine.status()).toBe(404);
    expect(await mine.json()).toEqual(await unknown.json());
    const done = await page.request.post(`/api/stems/${LINKS.receiptToken}/complete`, { data: { uploadId: "x" } });
    expect(done.status()).toBe(404);
  });

  test("another sender's proof doesn't open this receipt", async ({ page }) => {
    await page.goto(`/receipt/${LINKS.otherReceiptToken}`);
    await proveWithCode(page, LINKS.other.email, LINKS.other.masked);
    await expect(page.getByText(LINKS.other.title)).toBeVisible();
    await page.goto(RECEIPT);
    await expect(page.getByRole("button", { name: "Show my details" })).toBeVisible();
    const html = await (await page.request.get(RECEIPT)).text();
    for (const secret of PRIVATE) expect(html, secret).not.toContain(secret);
  });

  test("a code from the sender's email shows everything, stays after a reload; played out, the receipt is read-only", async ({ page }) => {
    await page.goto(RECEIPT);
    await proveWithCode(page, LINKS.sender.email, LINKS.sender.masked);
    await expect(page.getByText(LINKS.sender.title)).toBeVisible();
    await expect(page.getByText(LINKS.playedOutNote).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(LINKS.sender.title)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: `${LINKS.desk.name} played it out.` })).toBeVisible();
    // Played out is the track's final outcome (owner, 4 Nov): the record stays, nothing more can be done from it.
    await expect(page.getByText(/This receipt is read-only now/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop private sharing" })).toHaveCount(0);
    // Hidden is not the guard: the stop-sharing server action itself, called by its id as the browser would, as the
    // proven sender, answers false and changes nothing (the dev server's action manifest names the id).
    const manifest = JSON.parse(fs.readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node as Record<string, { filename: string; exportedName: string }>;
    const id = Object.entries(manifest).find(([, v]) => v.exportedName === "stopSharing" && v.filename.startsWith("src/app/receipt/"))?.[0];
    expect(id, "stopSharing compiled").toBeTruthy();
    const res = await page.request.post(RECEIPT, {
      headers: { "Next-Action": id!, Accept: "text/x-component", Origin: new URL(page.url()).origin, "Content-Type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([LINKS.receiptToken]),
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/^1:false$/m);
  });

  test("on an open receipt, stop sharing works only with proof", async ({ page, browser }) => {
    const other = `/receipt/${LINKS.otherReceiptToken}`;
    await page.goto(other);
    await proveWithCode(page, LINKS.other.email, LINKS.other.masked);
    await expect(page.getByText(LINKS.other.title)).toBeVisible();
    await expect(page.getByText(/This receipt is read-only now/)).toHaveCount(0);

    // Capture the stop-sharing server action, replay it from a browser without proof: refused, sharing stays on.
    const stop = page.getByRole("button", { name: "Stop private sharing" });
    await hydrated(stop);
    let action: { headers: Record<string, string>; body: string } | null = null;
    await page.route(other, async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        action = { headers: await req.allHeaders(), body: req.postData() ?? "" };
        return route.abort();
      }
      return route.continue();
    });
    await stop.click();
    await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
    await expect.poll(() => action).not.toBeNull();
    const stranger = await freshPage(browser);
    const headers = Object.fromEntries(Object.entries(action!.headers).filter(([k]) => k !== "cookie"));
    const replay = await stranger.request.post(other, { headers, data: action!.body });
    expect(replay.status()).toBeLessThan(500);
    await stranger.context().close();
    await page.unroute(other);
    await page.reload();
    const again = page.getByRole("button", { name: "Stop private sharing" });
    await hydrated(again);
    // With proof it works: the switch goes, and stays gone.
    await again.click();
    await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
    await expect(page.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(LINKS.other.title)).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop private sharing" })).toHaveCount(0);
  });

  test("a closed receipt shows only that it closed, and every route answers as for an unknown link", async ({ page, browser }) => {
    const closed = LINKS.closedReceiptToken;
    const unknown = "e2eNoSuchReceiptToken";
    await page.goto(`/receipt/${closed}`);
    await expect(page.getByRole("heading", { name: "This receipt has closed" })).toBeVisible();
    const html = await (await page.request.get(`/receipt/${closed}`)).text();
    for (const secret of [...PRIVATE, "An Older Groove", "Drums.wav"]) expect(html, secret).not.toContain(secret);
    // The live status, stems start and stems finish: byte for byte the unknown link's answer.
    const same = async (what: string, a: Promise<import("@playwright/test").APIResponse>, b: Promise<import("@playwright/test").APIResponse>) => {
      const [x, y] = await Promise.all([a, b]);
      expect(x.status(), what).toBe(y.status());
      expect(await x.text(), what).toBe(await y.text());
    };
    await same("pulse", page.request.get(`/api/pulse/receipt/${closed}`), page.request.get(`/api/pulse/receipt/${unknown}`));
    const start = { data: { fileName: "bass.wav", size: 1000 } };
    await same("stems start", page.request.post(`/api/stems/${closed}`, start), page.request.post(`/api/stems/${unknown}`, start));
    await same("stems finish", page.request.post(`/api/stems/${closed}/complete`, { data: { uploadId: "x" } }), page.request.post(`/api/stems/${unknown}/complete`, { data: { uploadId: "x" } }));
    // Even with proof of being the sender (this browser holds the sender's receipt cookie after a code), it stays closed.
    const proven = await freshPage(browser);
    await proven.goto(RECEIPT);
    await proveWithCode(proven, LINKS.sender.email, LINKS.sender.masked);
    await proven.goto(`/receipt/${closed}`);
    await expect(proven.getByRole("heading", { name: "This receipt has closed" })).toBeVisible();
    await same("stems start, proven", proven.request.post(`/api/stems/${closed}`, start), proven.request.post(`/api/stems/${unknown}`, start));
    // A stem started while it was open still finishes after the close, for its proven sender only (owner, 4 Nov).
    const finish = { data: { uploadId: LINKS.closedStemUpload } };
    await same("finish, no proof", page.request.post(`/api/stems/${closed}/complete`, finish), page.request.post(`/api/stems/${unknown}/complete`, finish));
    await same("finish, made-up upload", proven.request.post(`/api/stems/${closed}/complete`, { data: { uploadId: "e2eNoSuchUpload" } }), proven.request.post(`/api/stems/${unknown}/complete`, { data: { uploadId: "e2eNoSuchUpload" } }));
    const landed = await proven.request.post(`/api/stems/${closed}/complete`, finish);
    expect(landed.status()).toBe(200);
    expect((await landed.json()).name).toBe("Bass.wav");
    await proven.context().close();
  });

  test("sending from a browser shows that track's whole receipt there, and not in another browser", async ({ page, browser }) => {
    const email = `fresh.sender.${Date.now()}@example.com`;
    const since = Date.now() - 1000;
    // Confirm the email with a code (the bot check is Cloudflare's always-pass test key in the test copy).
    expect((await page.request.post("/api/sender-code", { data: { action: "send", email, turnstile: "XXXX.DUMMY.TOKEN.XXXX" } })).ok()).toBe(true);
    const code = await codeFor(page.request, email, since);
    expect((await page.request.post("/api/sender-code", { data: { action: "check", email, code } })).ok()).toBe(true);
    const file = wav(2);
    const meta = {
      name: "Fran Fresh", email, sender_instagram: "@franfresh", title: "Proof By Sending", artist: "Fran Fresh", genre: "House",
      mix_status: "mastered", release_status: "unsigned", ai_use: "none", fileName: "proof.wav", size: file.length,
    };
    const start = await page.request.post(`/api/submit/${LINKS.desk.handle}`, { data: meta });
    expect(start.ok(), await start.text()).toBe(true);
    const { uploadId, target } = (await start.json()) as { uploadId: string; target: { url: string; headers: Record<string, string> } };
    expect((await page.request.put(target.url, { headers: target.headers, data: file })).ok()).toBe(true);
    const done = await page.request.post(`/api/submit/${LINKS.desk.handle}/complete`, { data: { uploadId, duration: 2, bpm: 124 } });
    expect(done.ok(), await done.text()).toBe(true);
    expect(done.headers()["set-cookie"] ?? "").toMatch(/ft_receipt=[^;]+;.*HttpOnly/i);
    expect(done.headers()["set-cookie"] ?? "").toMatch(/SameSite=lax/i);
    const { token } = (await done.json()) as { token: string };

    await page.goto(`/receipt/${token}`);
    await expect(page.getByText("Proof By Sending")).toBeVisible();
    const elsewhere = await freshPage(browser);
    await elsewhere.goto(`/receipt/${token}`);
    await expect(elsewhere.getByRole("button", { name: "Show my details" })).toBeVisible();
    await expect(elsewhere.getByText("Proof By Sending")).toHaveCount(0);
    await elsewhere.context().close();
  });
});
