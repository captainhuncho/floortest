import { maskEmail } from "../src/lib/mask-email";
import type { Page } from "@playwright/test";
import { expect, test, wav } from "./fixtures";

/**
 * The one Terms tick on a send without an account (Research brief, owner 15 Nov): Send stays off until it's ticked,
 * and the tick names the play-out term with the Terms and Privacy linked.
 */
test("a sender without an account ticks the Terms before Send turns on", async ({ page }) => {
  await page.goto("/maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: "Tick - First.wav", mimeType: "audio/wav", buffer: wav(4) });
  const tick = page.getByRole("checkbox", { name: /I have read, understood and agree to the Terms, including that music I send may be played by the receiver, and have read the Privacy Policy/ });
  await expect(tick).toBeVisible({ timeout: 30_000 });
  const send = page.getByRole("button", { name: /^Send to / });
  await expect(send).toBeDisabled();
  await expect(page.getByText("Tick the box above to send.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms", exact: true }).first()).toHaveAttribute("href", "/terms");
  await tick.check();
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText("Tick the box above to send.")).toHaveCount(0);
  for (const [size, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]] as const) {
    await page.setViewportSize(viewport);
    await tick.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`terms-tick-${size}.png`) });
  }
});

const MAIL = `http://127.0.0.1:${Number(process.env.E2E_MAIL_PORT || 3212)}/mail`;

/**
 * Fills the link page's send form for a new sender, up to and including the Terms tick. It sends to Kit's link (a
 * passkey-test account) because the suite's other sends to /maxwell already use most of the 10-an-hour slots per
 * receiver and connection (src/lib/intake.ts), which made upload-resilience run out.
 */
async function fillFirstSend(page: Page, title: string, email: string) {
  await page.goto("/kitkeys");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: `Tick - ${title}.wav`, mimeType: "audio/wav", buffer: wav(4) });
  await expect(page.getByText(/WAV · \d+:\d+/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Artist").fill("First Sender");
  const genre = page.getByRole("combobox", { name: "Genre" });
  if (await genre.count()) await genre.selectOption({ index: 1 });
  else await page.getByRole("group", { name: /^Genre/ }).getByRole("button").first().click();
  await page.getByRole("group", { name: /^Mix/ }).getByRole("button", { name: "Mixed, not mastered" }).click();
  await page.getByRole("group", { name: /^Release/ }).getByRole("button", { name: "Unreleased" }).click();
  await page.getByRole("group", { name: /^AI use/ }).getByRole("button", { name: "None", exact: true }).click();
  await page.getByLabel(/^Your name/).fill("First Sender");
  await page.getByLabel(/^Your email/).fill(email);
  await page.getByLabel(/^Instagram/).fill("@firstsender");
  await expect(page.getByLabel("Artist")).toHaveValue("First Sender");
  await page.getByRole("checkbox", { name: /I have read, understood and agree to the Terms/ }).check();
}

test("a first-time sender confirms the code, ticks the Terms and the track goes through", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `first-${Date.now().toString(36)}@example.test`;
  await fillFirstSend(page, "Tick Second", email);
  const since = Date.now() - 1000;
  await page.getByRole("button", { name: /^Send to / }).click();
  let code = "";
  await expect
    .poll(async () => {
      const box = (await (await page.request.get(`${MAIL}?to=${encodeURIComponent(email)}`)).json()) as { body: string; at: number }[];
      code = box.filter((m) => m.at >= since).at(-1)?.body.match(/\b(\d{6})\b/)?.[1] ?? "";
      return code;
    }, { timeout: 30_000 })
    .toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  // Accepted and recorded: the send goes through instead of being refused for a missing tick.
  await expect(page.getByText(/Your receipt is on its way to/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/accept the Terms/)).toHaveCount(0);
});

test("when the Terms can't be checked, the send stops, says so and keeps the form filled", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `down-${Date.now().toString(36)}@example.test`;
  await fillFirstSend(page, "Tick Down", email);
  // The server can't read the Terms (#547): it answers 503 before any file is stored.
  const error = "Couldn't check the Terms just now. Nothing was sent. Try again in a minute: your details are still here.";
  let puts = 0;
  await page.route(/\/api\/submit\/kitkeys$/, (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error }) }) : route.continue(),
  );
  await page.route(/\/api\/storage\/upload/, (route) => (++puts, route.continue()));
  const since = Date.now() - 1000;
  await page.getByRole("button", { name: /^Send to / }).click();
  const box = async () => (await (await page.request.get(`${MAIL}?to=${encodeURIComponent(email)}`)).json()) as { body: string; at: number }[];
  await expect.poll(async () => (await box()).filter((m) => m.at >= since).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const code = (await box()).filter((m) => m.at >= since).at(-1)?.body.match(/\b(\d{6})\b/)?.[1] ?? "";
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(error).first()).toBeVisible({ timeout: 60_000 });
  expect(puts, "no file was uploaded").toBe(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Tick Down");
  // The confirmed sender is kept as one "Sending as …" line, with the email masked.
  await expect(page.getByText(`Sending as First Sender · ${maskEmail(email)}`)).toBeVisible();
  await expect(page.getByText(/Your receipt is on its way to/)).toHaveCount(0);
});
