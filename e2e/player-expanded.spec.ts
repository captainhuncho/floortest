import { expect, hydrated, logIn, test } from "./fixtures";

/**
 * The expanded player (owner's pick, 16 Nov, option 30; dashboard/PlayerExpanded.tsx). From 1024px a centred card over
 * the dimmed page; under that the whole window. One modal for the laptop bar and the phone's mini player.
 */
test("laptop: the bar's title and chevron open the expanded player; Up next plays a row; Escape gives focus back", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review");
  // Nothing playing: no bar, so no way in.
  await expect(page.locator("[data-player-bar]")).toHaveCount(0);
  const play = page.locator('a[aria-label^="Play "], button[aria-label^="Play "]').locator("visible=true").first();
  await hydrated(play);
  await play.click();
  const bar = page.locator("[data-player-bar]");
  await expect(bar).toBeVisible();
  const player = page.locator("dialog[data-player-expanded]");
  await expect(player).toBeHidden();

  const chevron = bar.getByRole("button", { name: "Open the player", exact: true });
  await chevron.click();
  await expect(player).toBeVisible();
  // A card, not the window: (1280 − 64) × 0.84, capped at 874, centred, with our corners.
  const box = () =>
    player.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), centred: Math.abs(r.left - (window.innerWidth - r.right)) <= 1, radius: getComputedStyle(el).borderRadius, inside: r.top >= 0 && r.bottom <= window.innerHeight };
    });
  // Read once it has finished scaling in.
  await expect.poll(box).toEqual({ width: 874, centred: true, radius: "22px", inside: true });
  const title = await player.getByRole("heading", { level: 2 }).innerText();
  await expect(player).toHaveAccessibleName(title);
  // The wave is 150px tall and the time is the big figure.
  expect(await player.getByRole("slider", { name: /^Seek / }).evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(150);
  // Focus starts on play / pause, and Tab stays inside.
  await expect(player.locator("[data-autofocus]")).toBeFocused();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[data-player-expanded]"))).toBe(true);
  }

  // Up next lists what follows; a row plays that track and the list moves on.
  const upNext = player.getByRole("region", { name: "Up next" });
  const rows = upNext.getByRole("button");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  const next = (await rows.first().getAttribute("aria-label"))!.replace(/^Play /, "");
  await rows.first().click();
  await expect(player.getByRole("heading", { level: 2 })).toHaveText(next);
  await expect(rows).toHaveCount(before - 1);

  // Escape closes it and focus goes back to the chevron; Close does the same from the title.
  await page.keyboard.press("Escape");
  await expect(player).toBeHidden();
  await expect(chevron).toBeFocused();
  await bar.locator("[data-open-player]").click();
  await expect(player).toBeVisible();
  await player.getByRole("button", { name: "Close player" }).click();
  await expect(player).toBeHidden();
});

test("phone: the mini player's title opens the player full window, and the heart there keeps", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review");
  const play = page.locator('a[aria-label^="Play "], button[aria-label^="Play "]').locator("visible=true").first();
  await hydrated(play);
  await play.click();
  const mini = page.locator("[data-mini-player]");
  await expect(mini).toBeVisible();
  await mini.locator("[data-open-player]").click();
  const player = page.locator("dialog[data-player-expanded]");
  await expect(player).toBeVisible();
  // Read once it has finished scaling in.
  await expect
    .poll(() =>
      player.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      }),
    )
    .toEqual([0, 0, 375, 812]);
  // Every control is a 44px target, and nothing runs off the side.
  const small = () =>
    player.evaluate((el) =>
      [...el.querySelectorAll("button, a")]
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { name: b.getAttribute("aria-label") ?? b.textContent, w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((c) => c.w > 0 && (c.w < 44 || c.h < 44)),
    );
  await expect.poll(small).toEqual([]);
  expect(await player.evaluate((el) => el.firstElementChild!.scrollWidth <= el.clientWidth)).toBe(true);

  const heart = player.locator("[data-heart]");
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  // Saved (a second tap before the answer comes back sends nothing), then put it back.
  await expect(page.getByText(/added to Prepare for set/)).toBeVisible();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");

  await player.getByRole("link", { name: "Open in Queue" }).click();
  await expect(player).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard\/review\?.*t=\d+/);
});
