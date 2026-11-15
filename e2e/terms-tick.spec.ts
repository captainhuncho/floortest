import { expect, test, wav } from "./fixtures";

/**
 * The one Terms tick on a send without an account (Research brief, owner 15 Nov): Send stays off until it's ticked,
 * and the tick names the play-out term with the Terms and Privacy linked.
 */
test("a sender without an account ticks the Terms before Send turns on", async ({ page }) => {
  await page.goto("/maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: "Tick - First.wav", mimeType: "audio/wav", buffer: wav(4) });
  const tick = page.getByRole("checkbox", { name: /I have read, understood and agree to the Terms, and have read the Privacy Policy, including that music I send may be played by the receiver/ });
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

test("a first-time sender confirms the code, ticks the Terms and the track goes through", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `first-${Date.now().toString(36)}@example.test`;
  await page.goto("/maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: "Tick - Second.wav", mimeType: "audio/wav", buffer: wav(4) });
  await expect(page.getByText(/WAV · \d+ KB · \d+:\d+/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Track title").fill("Tick Second");
  await page.getByLabel("Artist").fill("First Sender");
  const genre = page.getByRole("combobox", { name: "Genre" });
  if (await genre.count()) await genre.selectOption({ index: 1 });
  else await page.getByRole("group", { name: /^Genre/ }).getByRole("radio").first().check({ force: true });
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
  await page.getByLabel(/^Your name/).fill("First Sender");
  await page.getByLabel(/^Your email/).fill(email);
  await page.getByLabel(/^Instagram/).fill("@firstsender");
  await expect(page.getByLabel("Artist")).toHaveValue("First Sender");
  await page.getByRole("checkbox", { name: /I have read, understood and agree to the Terms/ }).check();
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
  await page.getByRole("button", { name: /^Confirm and send to / }).click();
  // Accepted and recorded: the send goes through instead of being refused for a missing tick.
  await expect(page.getByText(/Nothing else to do/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/accept the Terms/)).toHaveCount(0);
});
