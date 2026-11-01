import { expect, logIn, test } from "./fixtures";

/** Settings → Account's shortcut switch: off, K does nothing in the Queue; on again, K keeps (and Undo puts it back). */
test("the shortcut switch turns the Queue's letter keys off and on", async ({ page }) => {
  await logIn(page, "demo@floortest.test");

  const kept = page.getByText(/added to Prepare for set/);
  const keep = page.getByRole("complementary", { name: "Review" }).getByRole("button", { name: /^Keep/ }).locator("visible=true").first();

  // The Queue streams in as server HTML before React takes it over, so Keep shows a moment before K is listened for
  // (1 Nov: under a loaded full run K landed in that gap, nothing was kept and "added to Prepare for set" never came).
  // Wait until React owns the button, then a frame for its effects, before pressing K. Limit: "__reactProps" is React's
  // own internal key on a hydrated element, not a public API; a React upgrade could rename it, and then this poll fails
  // every run (never passes silently). The lasting fix is an app-side sign, such as a data attribute on the rail set
  // once its key listener is on (DecisionRail, the Queue screen).
  async function ready() {
    await expect(keep).toBeVisible();
    await expect.poll(() => keep.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }

  // Off: K is ignored and the track stays up for review.
  await page.evaluate(() => localStorage.setItem("ft:shortcuts", "off"));
  await page.goto("/dashboard/review?view=queue");
  await ready();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("k");
  await page.waitForTimeout(800);
  await expect(kept).toHaveCount(0);
  await expect(keep).toBeVisible();

  // On: K keeps the track, then Undo puts it back.
  await page.evaluate(() => localStorage.removeItem("ft:shortcuts"));
  await page.reload();
  await ready();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("k");
  await expect(kept.first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).first().click();
});

/**
 * The desk player's media keys and volume keys (1 Nov). Chrome gives no way to read back Media Session handlers, so a
 * small wrapper records what the page registers; the handlers themselves are unit-tested (tests/media-keys.test.ts).
 */
test("the desk player takes the media keys, and Shift+↑/↓ and M set its volume", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: Record<string, boolean> = {};
    (window as unknown as { __media: Record<string, boolean> }).__media = seen;
    const s = navigator.mediaSession;
    const set = s.setActionHandler.bind(s);
    s.setActionHandler = (action, handler) => {
      seen[action] = !!handler;
      set(action, handler);
    };
  });
  await logIn(page, "demo@floortest.test");
  await page.evaluate(() => {
    localStorage.removeItem("ft:volume");
    localStorage.removeItem("ft:muted");
  });
  await page.goto("/dashboard/review?view=queue");
  const keep = page.getByRole("complementary", { name: "Review" }).getByRole("button", { name: /^Keep/ }).locator("visible=true").first();
  await expect(keep).toBeVisible();
  await expect.poll(() => keep.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  const media = () => page.evaluate(() => (window as unknown as { __media: Record<string, boolean> }).__media);
  await expect.poll(async () => (await media()).seekto).toBe(true);
  expect(await media()).toMatchObject({ play: true, pause: true, stop: true, seekbackward: true, seekforward: true, seekto: true, nexttrack: true, previoustrack: true });

  // Space loads the open track into the player; then the volume keys work and the track stays the same.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Space");
  const bar = page.locator("[data-player-bar]");
  await expect(bar).toBeVisible();
  await expect.poll(() => page.evaluate(() => (navigator.mediaSession.metadata as MediaMetadata | null)?.title ?? "")).not.toBe("");
  const url = page.url();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const note = bar.locator("[data-volume-note]");
  await expect(note).toHaveText("Volume 80%");
  expect(await page.evaluate(() => localStorage.getItem("ft:volume"))).toBe("0.8");
  expect(page.url()).toBe(url);
  // Said once, after the keys settle.
  await expect(bar.locator("[aria-live=polite]")).toHaveText("Volume 80%");
  await page.keyboard.press("m");
  await expect(note).toHaveText("Muted");
  expect(await page.evaluate(() => localStorage.getItem("ft:muted"))).toBe("1");
  await page.keyboard.press("m");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(note).toHaveText("Volume 90%");
  await page.evaluate(() => {
    localStorage.removeItem("ft:volume");
    localStorage.removeItem("ft:muted");
  });
});
