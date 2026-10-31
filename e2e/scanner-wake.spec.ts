import type { Page } from "@playwright/test";
import { expect, logIn, test, wav } from "./fixtures";

/**
 * Hold and scan (owner, 26 Oct). The virus scanner sleeps when idle. A track sent while it sleeps is received and held,
 * never refused and never on the desk unscanned; the every-5-minutes job wakes the scanner once for the batch and
 * delivers it. The scanner here is e2e/fake-scanner.mjs, the app waits 6 s for a waking scanner (SCAN_DEADLINE_MS in
 * playwright.config.ts) instead of 150 s, and the test runs the job itself.
 */
// The fake scanner's port follows playwright.config.ts (E2E_SCANNER_PORT, default 3211).
const SCANNER = `http://127.0.0.1:${process.env.E2E_SCANNER_PORT || 3211}`;
const CRON = { Authorization: "Bearer e2e-cron-secret-not-used-anywhere-else" };

// Its own connection address (a documentation IP; the local copy reads it from this header, Vercel never does), so its
// uploads don't use up the hourly per-connection limit the other upload specs share.
test.use({ extraHTTPHeaders: { "x-vercel-forwarded-for": "203.0.113.26" } });

async function scannerMode(page: Page, mode: { asleepMs?: number; down?: boolean }) {
  await page.request.post(`${SCANNER}/__mode`, { data: mode });
}
const seen = async (page: Page) => (await (await page.request.get(`${SCANNER}/__seen`)).json()) as string[];
const runBatch = async (page: Page) => (await (await page.request.get("/api/cron/scan-held", { headers: CRON })).json()) as Record<string, number>;

async function send(page: Page, title: string) {
  await page.goto("/dashboard/send?to=maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: `Scanner - ${title}.wav`, mimeType: "audio/wav", buffer: wav(4) });
  await expect(page.getByRole("button", { name: /^Send to / })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("textbox", { name: "Track title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Artist", exact: true }).fill("Scanner");
  await page.getByRole("group", { name: /^Genre/ }).locator("label").first().click();
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
  await page.getByRole("button", { name: /^Send to / }).click();
}

test.afterEach(async ({ page }) => scannerMode(page, {}));

test("a sleeping scanner: the track is received and held without waking it, then the batch wakes it once and delivers", async ({ page }) => {
  await logIn(page, "sender@floortest.test");
  await scannerMode(page, { asleepMs: 600_000 });
  await send(page, "Night Bus");
  await expect(page.getByRole("heading", { name: /“Night Bus” is received\./ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/We're checking it for viruses, which can take up to 10 minutes/)).toBeVisible();
  await expect(page.getByRole("link", { name: "View receipt" })).toHaveCount(0);
  expect(await seen(page)).not.toContain("POST /wake");
  expect(await seen(page)).not.toContain("POST /scan");

  const result = await runBatch(page);
  expect(result).toMatchObject({ delivered: 1, refused: 0, waiting: 0 });
  expect((await seen(page)).filter((s) => s === "POST /wake")).toHaveLength(1);
});

test("a scanner that stays down: the track stays held through a batch, then arrives on the next one", async ({ page }) => {
  await logIn(page, "sender@floortest.test");
  await scannerMode(page, { down: true });
  await send(page, "Held Over");
  await expect(page.getByRole("heading", { name: /“Held Over” is received\./ })).toBeVisible({ timeout: 30_000 });
  expect(await runBatch(page)).toMatchObject({ delivered: 0, waiting: 1 });
  await scannerMode(page, {});
  expect(await runBatch(page)).toMatchObject({ delivered: 1, waiting: 0 });
});
