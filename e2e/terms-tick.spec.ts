import { expect, test, wav } from "./fixtures";

/**
 * The one Terms tick on a send without an account (Research brief, owner 15 Nov): Send stays off until it's ticked,
 * and the tick names the play-out term with the Terms and Privacy linked.
 */
test("a sender without an account ticks the Terms before Send turns on", async ({ page }) => {
  await page.goto("/maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: "Tick - First.wav", mimeType: "audio/wav", buffer: wav(4) });
  const tick = page.getByRole("checkbox", { name: /I have read, understood and agree to the Terms and Privacy Policy, including that music I send may be played by the receiver/ });
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
