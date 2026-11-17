import { expect, hydrated, logIn, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * The floating player and menu (owner's pick, 16 Nov). Phones: the mini player sits over the menu as one pair
 * (BottomPair.tsx); laptops: one bar inside the page column, never across the menu rail (PlayerBars.tsx).
 */
test("phone: the menu sits alone, the player joins it, the heart keeps with Undo, and typing hides the pair", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review");
  const pair = page.locator("[data-bottom-pair]");
  const menu = pair.getByRole("navigation", { name: "Main" });
  const mini = pair.getByRole("region", { name: "Now playing" });
  await expect(menu).toBeVisible();
  await expect(mini).toHaveCount(0);
  await expect(menu.getByRole("link", { name: /^Queue/ })).toHaveAttribute("aria-current", "page");

  const play = page.locator('a[aria-label^="Play "], button[aria-label^="Play "]').locator("visible=true").first();
  await hydrated(play);
  await play.click();
  await expect(mini).toBeVisible();
  // Same width, 8px apart, the player first in reading order, our own corners. Read once the player has finished rising.
  const shape = () =>
    pair.evaluate((el) => {
    const [a, b] = [el.querySelector("[data-mini-player]")!, el.querySelector("[data-tabbar]")!];
    const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
    return {
      gap: Math.round(rb.top - ra.bottom),
      sameWidth: Math.round(ra.width) === Math.round(rb.width),
      left: Math.round(ra.left),
      playerFirst: !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
      radii: [getComputedStyle(a).borderRadius, getComputedStyle(b).borderRadius],
    };
    });
  await expect.poll(shape).toEqual({ gap: 8, sameWidth: true, left: 12, playerFirst: true, radii: ["18px", "22px"] });

  // The title is a 44px target: its tap area runs from 14px above the player down to the wave.
  const title = await mini.evaluate((el) => {
    const link = el.querySelector("[data-open-player]")!;
    const r = link.getBoundingClientRect();
    const hit = (y: number) => document.elementFromPoint(r.left + 20, y)?.closest("[data-open-player]") === link;
    return { above: hit(r.top - 13), bottom: hit(r.bottom - 1), height: Math.round(r.height) + 14 };
  });
  expect(title).toEqual({ above: true, bottom: true, height: 44 });
  // The volume note sits over the title's right end; hidden or showing, a tap there still reaches the title.
  expect(
    await mini.evaluate((el) => {
      const link = el.querySelector("[data-open-player]")!;
      const r = link.getBoundingClientRect();
      return document.elementFromPoint(r.right - 8, r.bottom - 8)?.closest("[data-open-player]") === link;
    }),
  ).toBe(true);

  // Keep from the heart: saved on the server, with Undo.
  const heart = mini.getByRole("button", { name: /^Keep / });
  await heart.click();
  await expect(page.getByText(/added to Prepare for set/)).toBeVisible();
  await expect(mini.locator("[data-heart]")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(mini.locator("[data-heart]")).toHaveAttribute("aria-pressed", "false");

  // More holds the rest of the menu, in order.
  await menu.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "More" }).getByRole("link")).toHaveText(["Send music", "Contacts", "Activity", "How it works"]);
  await page.keyboard.press("Escape");

  // A text field in use: the pair steps aside, and comes back after.
  const search = page.getByPlaceholder(/Search/).first();
  await search.focus();
  await expect(pair).toBeHidden();
  await search.blur();
  await expect(pair).toBeVisible();
});

test("laptop: a compact bar floats centred in the page column, and the volume level shows only on hover or focus", async ({ page }) => {
  test.setTimeout(180_000);
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review");
  const play = page.locator('a[aria-label^="Play "], button[aria-label^="Play "]').locator("visible=true").first();
  await hydrated(play);
  await play.click();
  const bar = page.getByRole("region", { name: "Now playing" }).and(page.locator("[data-player-bar]"));
  await expect(bar).toBeVisible();
  // The bar rises in over 220ms, so its place is read until it has settled.
  await expect
    .poll(() =>
      bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const rail = document.querySelector("aside")!.getBoundingClientRect();
        const column = document.querySelector("#main")!.getBoundingClientRect();
        return {
          clearOfRail: r.left >= rail.right + 20,
          centred: Math.abs((r.left + r.right) / 2 - (column.left + column.right) / 2) <= 1,
          compact: r.width < 820,
          fromBottom: Math.round(innerHeight - r.bottom),
          radius: getComputedStyle(el).borderRadius,
        };
      }),
    )
    .toEqual({ clearOfRail: true, centred: true, compact: true, fromBottom: 20, radius: "18px" });
  await expect(bar.getByRole("button", { name: "Next track" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Previous track" })).toBeVisible();

  // Volume: only the speaker by default; the slider and its level come out for the pointer, and for the keyboard.
  const slider = bar.getByRole("slider", { name: "Volume" });
  const width = () => slider.evaluate((el) => Math.round(el.parentElement!.getBoundingClientRect().width));
  expect(await width()).toBe(0);
  await bar.getByRole("button", { name: "Mute" }).hover();
  await expect.poll(width).toBe(84);
  await page.mouse.move(5, 5);
  await expect.poll(width).toBe(0);
  await slider.focus();
  await expect.poll(width).toBe(84);
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d+%$/);
});

/** The More sheet follows the menu rail's rule for Send: a team member on the team's desk isn't offered it. */
test("phone: a member on a team desk has no Send music in More", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page, "listener@floortest.test");
  await page.getByText("Switch desk").click();
  await page.getByRole("button", { name: /Tia Teams/ }).click();
  await expect(page.getByText(/On Tia Teams.s desk as a member/)).toBeVisible();
  await page.locator("[data-tabbar]").getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "More" }).getByRole("link")).toHaveText(["Contacts", "Activity", "How it works"]);
});

/** With "Send music between desks" off nobody is offered it; turned back on, it returns. */
test("phone: Send music leaves More while send_music is off", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const ops = await browser.newPage();
  const flip = async (on: boolean) => {
    await ops.goto("/admin/switches");
    const row = ops.getByRole("listitem").filter({ hasText: "Send music between desks" });
    await row.getByRole("button", { name: `${on ? "Turn on" : "Turn off"} Send music between desks` }).click();
    await ops.locator("dialog[open]").getByRole("button", { name: on ? "Turn on" : "Turn off" }).click();
    await expect(row.getByText(on ? "On" : "Off", { exact: true })).toBeVisible();
  };
  await opsLogIn(ops);
  await flip(false);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await logIn(page, "demo@floortest.test");
    await page.goto("/dashboard/floor");
    await page.locator("[data-tabbar]").getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More" }).getByRole("link")).toHaveText(["Contacts", "Activity", "How it works"]);
  } finally {
    await flip(true);
    await ops.close();
  }
});
