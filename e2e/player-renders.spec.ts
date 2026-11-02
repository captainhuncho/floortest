import { expect, logIn, test } from "./fixtures";

/**
 * The player's time lives outside its main context (src/components/Player.tsx, speed fixes phase 1, 2 Nov): while a
 * track plays, only what shows time or progress re-renders (about 4 times a second); the review rail and the track
 * list don't. Commits are counted by useRenderProbe (src/lib/render-probe.ts), switched on by the init script here.
 */
const PLAY_MS = 2000;

test("while a track plays, components that don't show time don't re-render", async ({ page }) => {
  // The first open of the review page compiles it in the dev server; give that room on a busy machine.
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.__ftRenders = {};
  });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review");
  await page.getByRole("button", { name: /^Play / }).first().click();
  const bar = page.locator("[data-player-bar]");
  await expect(bar.getByRole("button", { name: /^Pause / })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Pause / })).not.toHaveAttribute("aria-busy", "true");
  // Sound has started: the time under the bar has moved off 0:00.
  await expect(bar.locator("span.tnum").first()).not.toHaveText("0:00", { timeout: 15_000 });

  const counts = await page.evaluate(async (ms) => {
    const before = { ...window.__ftRenders };
    await new Promise((r) => setTimeout(r, ms));
    const after = { ...window.__ftRenders };
    return Object.fromEntries(Object.keys(after).map((k) => [k, (after[k] ?? 0) - (before[k] ?? 0)]));
  }, PLAY_MS);

  // Still playing at the end (a stop would also stop the re-renders and make this pass for the wrong reason).
  await expect(bar.getByRole("button", { name: /^Pause / })).toBeVisible();
  expect(counts.PlayerClock ?? 0, "the bar's clock shows the time, so it does follow it").toBeGreaterThanOrEqual(2);
  for (const name of ["PlayerBar", "DecisionRail", "TrackList", "ListRows"]) {
    if (name in counts) expect(counts[name], `${name} re-renders`).toBeLessThanOrEqual(1);
  }
  expect(["DecisionRail", "TrackList", "ListRows"].some((k) => k in counts), "a non-time consumer is on the page").toBe(true);
});
