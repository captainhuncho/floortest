import { expect, hydrated, logIn, test } from "./fixtures";

/**
 * The expanded player (Design options 27 to 30; dashboard/PlayerExpanded.tsx). From 1024px a centred card over
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
  // A card, not the window: 70% of its width and 80% of its height (1280 × 800), centred, with our corners.
  const box = () =>
    player.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height), centred: Math.abs(r.left - (window.innerWidth - r.right)) <= 1, radius: getComputedStyle(el).borderRadius, inside: r.top >= 0 && r.bottom <= window.innerHeight };
    });
  // Read once it has finished scaling in.
  await expect.poll(box).toEqual({ width: 896, height: 640, centred: true, radius: "22px", inside: true });
  const title = await player.getByRole("heading", { level: 2 }).innerText();
  await expect(player).toHaveAccessibleName(title);
  // The wave is 150px tall.
  expect(await player.getByRole("slider", { name: /^Seek / }).evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(150);
  // Top row: the chevron, then where the track sits. Play or pause sits in the transport row, and focus starts on it.
  await expect(player.getByText(/^(Waiting|Playing from (Kept|Not for me))$/)).toBeVisible();
  await expect(player.locator("[data-autofocus]")).toBeFocused();
  await expect(player.locator("[data-autofocus]")).toHaveAccessibleName(/^(Play|Pause) /);
  // The cover beside the title is art only in here.
  expect(await player.locator("[data-autofocus] img").count()).toBe(0);
  expect(await player.locator("[data-autofocus]").evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(56);
  // Previous, Back 15, play or pause in the middle, Forward 15, Next, in that order.
  expect(await player.getByRole("group", { name: "Playback" }).getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!.replace(/^(Play|Pause) .*/, "Play or pause")))).toEqual(["Previous track", "Back 15 seconds", "Play or pause", "Forward 15 seconds", "Next track"]);
  // Volume is on show with its level, with no pointer near it.
  await page.mouse.move(5, 5);
  const volume = player.getByRole("slider", { name: "Volume" });
  await expect(volume).toBeVisible();
  expect(await volume.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(200);
  await expect(volume).toHaveAttribute("aria-valuetext", /^\d+%$/);
  // Tab stays inside.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[data-player-expanded]"))).toBe(true);
  }

  // Up next lists what follows; a row plays that track and the list moves on.
  const upNext = player.getByRole("region", { name: "Up next" });
  const rows = upNext.getByRole("button");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  // Each row has its cover and its length.
  expect(await rows.first().locator("img").count()).toBe(1);
  await expect(rows.first()).toContainText(/\d:\d\d/);
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

test("phone: the mini player's title opens the player full window; Keep and Not for me work from it", async ({ page }) => {
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
  // Space at the top: 56px of nothing between the top row and the time; then a 124px wave and a 56px cover.
  expect(
    await player.evaluate((el) => {
      const px = (n: Element) => n.getBoundingClientRect();
      const top = el.querySelector("[data-player-top]")!;
      return {
        space: Math.round(px(top.querySelector("p")!).top - px(top).top),
        wave: Math.round(px(el.querySelector('[role="slider"][aria-label^="Seek "]')!).height),
        cover: Math.round(px(el.querySelector("[data-player-cover]")!).width),
      };
    }),
  ).toEqual({ space: 56, wave: 124, cover: 56 });

  const heart = player.locator("[data-heart]");
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  // Saved (a second tap before the answer comes back sends nothing), then put it back.
  await expect(page.getByText(/added to Prepare for set/)).toBeVisible();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");

  // The title leads to the track's page in every state. A waiting track: Keep and Not for me, and no volume row on phones.
  await expect(player.locator("[data-open-track]")).toHaveAttribute("href", /\/dashboard\/review\?.*t=\d+/);
  await expect(player.getByRole("slider", { name: "Volume" })).toBeHidden();
  const keep = player.getByRole("button", { name: "Keep", exact: true });
  const pass = player.getByRole("button", { name: "Not for me", exact: true });
  await expect(player.getByText("Waiting", { exact: true })).toBeVisible();
  await pass.click();
  await expect(page.getByText(/^Not for me: /)).toBeVisible();
  await expect(player.getByText("Playing from Not for me")).toBeVisible();
  // The heart's two messages can still be on screen, each with its own Undo: take the one for Not for me.
  // Messages are drawn inside the open player, so Undo can be pressed (the page behind a modal is inert).
  await player.locator("[data-toast]").filter({ hasText: "Not for me: " }).getByRole("button", { name: "Undo" }).click();
  await expect(player.getByText("Waiting", { exact: true })).toBeVisible();

  // Kept: Open track, and no Played out (the player can't tell whether this track may be marked).
  await keep.click();
  await expect(player.getByText("Playing from Kept")).toBeVisible();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(player.getByRole("button", { name: /Played/ })).toHaveCount(0);
  await expect.poll(small).toEqual([]);

  await player.getByRole("link", { name: "Open track" }).click();
  await expect(player).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard\/review\?.*t=\d+/);

  // Put the track back as it was, so the next spec finds it waiting.
  await mini.locator("[data-open-player]").click();
  await expect(player).toBeVisible();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect(player.getByText("Waiting", { exact: true })).toBeVisible();
});
