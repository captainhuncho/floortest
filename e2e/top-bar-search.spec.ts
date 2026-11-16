import { expect, logIn, test } from "./fixtures";

/**
 * The top bar's search (owner, 16 Nov): from 1024px a field beside the bell, 240px wide and 360px from 1100px; under
 * 1024px the 44px icon. Both are one button that opens the same search card, and ⌘K still does.
 */
test("search is a field beside the bell on laptops and an icon under 1024px", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections");
  const search = page.locator("[data-search]");
  const bell = page.getByRole("button", { name: /^Notifications/ });
  const width = async () => Math.round((await search.boundingBox())!.width);
  const height = async () => Math.round((await search.boundingBox())!.height);

  await expect(search).toContainText("Tracks, artists or contacts");
  await expect(search).toHaveAccessibleName("Search");
  // The hint names the key this keyboard has.
  const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform));
  await expect(search.locator("kbd")).toHaveText(apple ? "⌘K" : "Ctrl K");
  expect(await width()).toBe(360);
  expect(await height()).toBe(44);
  // Beside the bell: the field ends where the bell starts, give or take the box's 2px gap.
  const [s, b] = [(await search.boundingBox())!, (await bell.boundingBox())!];
  expect(b.x - (s.x + s.width)).toBeLessThanOrEqual(4);
  expect(b.x - (s.x + s.width)).toBeGreaterThanOrEqual(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(width).toBe(240);
  expect(await height()).toBe(44);
  // Nothing in the bar runs off the page at the narrowest field size.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  for (const w of [768, 375]) {
    await page.setViewportSize({ width: w, height: 800 });
    await expect.poll(width).toBe(44);
    await expect(search.getByText("Tracks, artists or contacts")).toBeHidden();
  }

  // The field opens the search card, and so does the shortcut.
  await page.setViewportSize({ width: 1280, height: 800 });
  await search.click();
  const card = page.getByRole("dialog", { name: "Search" });
  await expect(card.getByRole("textbox", { name: "Search tracks, artists or contacts" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(card).toBeVisible();
});
