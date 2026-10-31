import type { CDPSession, Page } from "@playwright/test";
import { expect, logIn, test } from "./fixtures";

// Pull to refresh (owner's rule; src/lib/pull-refresh.ts): on a phone, a pull down from the resting top of the Floor
// refreshes on release; a pull that's pushed back up before letting go does not.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** A real touch drag through the browser (Chrome DevTools protocol), from y0 through each y in turn, then lift. */
async function drag(cdp: CDPSession, x: number, ys: number[]) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: ys[0] }] });
  for (const y of ys.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const steps = (from: number, to: number, n = 12) => Array.from({ length: n + 1 }, (_, i) => Math.round(from + ((to - from) * i) / n));
const refreshes = (page: Page) => page.evaluate(() => (window as unknown as { __pulls: number }).__pulls);

test("pulling down from the top of the Floor and letting go refreshes; pushing back first does not", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");
  await expect(page.locator("#main h1").first()).toBeVisible();
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.count()) await notNow.first().click();
  await page.evaluate(() => {
    const w = window as unknown as { __pulls: number };
    w.__pulls = 0;
    window.addEventListener("ft:refresh", () => w.__pulls++);
  });
  const cdp = await page.context().newCDPSession(page);
  const x = 195, y0 = 260;
  // The page must have rested at the top for half a second before a pull can start.
  await page.waitForTimeout(800);

  // Pulled down past the line, then pushed back up before letting go: springs back, nothing reloads.
  await drag(cdp, x, [...steps(y0, y0 + 320), ...steps(y0 + 320, y0 + 40, 8)]);
  await page.waitForTimeout(800);
  expect(await refreshes(page)).toBe(0);

  // Pushing back up past where it started scrolls the page like any drag: back to the top, and rest there again.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);

  // Pulled down past the line and let go: the page's data reloads in place (a server components request).
  const reload = page.waitForRequest((r) => r.headers()["rsc"] === "1" && new URL(r.url()).pathname === "/dashboard/floor", { timeout: 15_000 });
  await drag(cdp, x, steps(y0, y0 + 320));
  await expect(page.locator(".ptr-ring[data-spinning]")).toHaveCount(1);
  await reload;
  expect(await refreshes(page)).toBe(1);
  // Then it lets go: the ring stops and the page springs back.
  await expect(page.locator(".ptr-ring[data-spinning]")).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => document.getElementById("main")?.style.translate ?? "")).toBe("");
});
