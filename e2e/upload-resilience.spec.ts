import type { Page } from "@playwright/test";
import { expect, logIn, test, wav } from "./fixtures";

/**
 * Uploads on bad connections: a file bigger than 10 MB goes through on a test copy (the local upload route sits
 * outside the proxy's body limit), and a dropped upload is tried again by itself instead of failing the send.
 */
async function fillSend(page: Page, title: string, seconds: number) {
  await page.goto("/dashboard/send?to=maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: `Resilience - ${title}.wav`, mimeType: "audio/wav", buffer: wav(seconds) });
  await expect(page.getByRole("button", { name: /^Send to / })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("textbox", { name: "Track title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Artist", exact: true }).fill("Resilience");
  await page.getByRole("group", { name: /^Genre/ }).locator("label").first().click();
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
}

// One upload covers both (the suite shares an hourly per-connection upload limit): about 13 MB, and its first
// attempt is dropped, so it has to be tried again by itself and arrive whole.
test("a track bigger than 10 MB whose first attempt drops is tried again and arrives whole", async ({ page }) => {
  await logIn(page, "sender@floortest.test");
  await fillSend(page, "Second Wind", 300);
  let puts = 0;
  await page.route(/\/api\/storage\/upload/, (route) => (route.request().method() === "PUT" && ++puts === 1 ? route.abort("failed") : route.continue()));
  await page.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByText(/We sent a receipt to/)).toBeVisible({ timeout: 80_000 });
  expect(puts).toBe(2);
});
