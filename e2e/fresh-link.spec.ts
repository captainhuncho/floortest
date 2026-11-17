import { expect, logIn, test } from "./fixtures";

/**
 * Playback links last 5 minutes (src/lib/file-access.ts). When one fails mid-play (it ran out, or the connection dropped),
 * the player asks the app for a fresh one through the same checked route instead of going silent (src/components/Player.tsx).
 */
test("a failed playback link is replaced by a fresh one from the app", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  let asked = 0;
  await page.route("**/api/tracks/*/audio", (route) => (++asked === 1 ? route.abort("failed") : route.continue()));
  await page.goto("/dashboard/review");
  // The Queue's playlist has no play buttons (Design option 42): a row plays its track.
  await page.getByRole("table", { name: "Up next" }).getByRole("link", { name: /^Play / }).first().click();
  await expect.poll(() => asked, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
});
