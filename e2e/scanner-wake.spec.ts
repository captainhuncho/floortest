import type { Page } from "@playwright/test";
import { expect, logIn, test, wav } from "./fixtures";

/**
 * The virus scanner sleeps when idle (owner, 26 Oct). A sender whose upload lands while it wakes sees that the file is
 * being checked, never a failure; if it doesn't wake in time, the file is held and Send again finishes it without
 * uploading it twice. Nothing unscanned reaches the desk either way. The scanner here is e2e/fake-scanner.mjs, and
 * the app waits 6 s for it (SCAN_DEADLINE_MS in playwright.config.ts) instead of 150 s.
 */
const SCANNER = "http://127.0.0.1:3211";

async function scannerMode(page: Page, mode: { asleepMs?: number; down?: boolean }) {
  await page.request.post(`${SCANNER}/__mode`, { data: mode });
}

async function fillSend(page: Page, title: string) {
  await page.goto("/dashboard/send?to=maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: `Scanner - ${title}.wav`, mimeType: "audio/wav", buffer: wav(4) });
  await expect(page.getByRole("button", { name: /^Send to / })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("textbox", { name: "Track title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Artist", exact: true }).fill("Scanner");
  await page.getByRole("group", { name: /^Genre/ }).locator("label").first().click();
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
}

// Its own connection address (a documentation IP; the local copy reads it from this header, Vercel never does), so its
// uploads don't use up the hourly per-connection limit the other upload specs share.
test.use({ extraHTTPHeaders: { "x-vercel-forwarded-for": "203.0.113.26" } });

test.afterEach(async ({ page }) => scannerMode(page, {}));

test("a sleeping scanner: the sender sees the file being checked, then it arrives", async ({ page }) => {
  await logIn(page, "sender@floortest.test");
  await fillSend(page, "Cold Start");
  await scannerMode(page, { asleepMs: 4_000 });
  await page.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByText(/Checking your file for viruses: this can take up to a minute/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/We sent a receipt to/)).toBeVisible({ timeout: 30_000 });
  const seen = (await (await page.request.get(`${SCANNER}/__seen`)).json()) as string[];
  expect(seen).toContain("POST /wake");
  expect(seen.filter((s) => s === "POST /scan").length).toBeGreaterThan(1);
});

test("a scanner that doesn't wake in time: the file is held, nothing arrives, and Send again finishes it without re-uploading", async ({ page }) => {
  await logIn(page, "sender@floortest.test");
  await fillSend(page, "Held Over");
  await scannerMode(page, { down: true });
  let puts = 0;
  await page.route(/\/api\/storage\/upload/, (route) => (route.request().method() === "PUT" && ++puts, route.continue()));
  await page.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByText(/our virus check is taking longer than usual/).first()).toBeVisible({ timeout: 60_000 });
  expect(puts).toBe(1);
  await expect(page.getByText(/We sent a receipt to/)).toHaveCount(0);

  await scannerMode(page, {});
  await page.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByText(/We sent a receipt to/)).toBeVisible({ timeout: 30_000 });
  expect(puts).toBe(1);
});
