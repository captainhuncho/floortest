import { expect, hydrated, logIn, test } from "./fixtures";

// The final Queue (Design option 42): the open track decides, the playlist plays, the floating player shows progress.

test("laptop: Now reviewing has no wave or play button, the playlist plays and sorts, typing never decides", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review?view=queue");
  const card = page.locator("#review-card");
  const list = page.getByRole("table", { name: "Up next" });
  await expect(card.getByText(/^1 of \d+$/).locator("visible=true")).toBeVisible();
  await expect(card.getByRole("slider")).toHaveCount(0);
  await expect(card.locator("[data-card-play]")).toBeHidden();

  // Compact card (owner, 19 Nov): Keep is first and the only filled button; only More sits beside the decision.
  const decision = card.getByRole("group", { name: "Decision" }).getByRole("button");
  await expect(decision.first()).toHaveText(/Keep/);
  await expect(decision.nth(1)).toHaveText(/Not for me/);
  await expect(card.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Download", exact: true })).toHaveCount(0);

  // Reply is a layer, opened from More: the panel opens with the cursor in the box. Letter keys typed there are text,
  // never a decision; Escape closes it, keeps the text and puts focus back on More.
  const title = await card.getByRole("heading", { level: 2 }).innerText();
  const replyButton = card.getByRole("button", { name: "More", exact: true });
  const openReply = async () => {
    await replyButton.click();
    await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Reply" }).click();
  };
  await openReply();
  const panel = page.getByRole("dialog", { name: /^Reply to / });
  const box = panel.getByRole("textbox", { name: /^Your reply to / });
  await expect(box).toBeFocused();
  await page.keyboard.type("kx");
  await expect(box).toHaveValue("kx");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(replyButton).toBeFocused();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(title);
  await expect(card.getByRole("button", { name: /Keep/ })).toHaveAttribute("aria-pressed", "false");
  // With focus on a button in the panel (not in the box), K and X still belong to the panel: nothing is decided.
  await openReply();
  await panel.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("k");
  await page.keyboard.press("x");
  await expect(panel).toBeVisible();
  // The track's own title: the open panel has a heading of its own.
  await expect(card.locator('h2[id^="track-h-"]')).toHaveText(title);
  await expect(card.getByRole("button", { name: /Keep/ })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  // Gone, not fading out: keys are ignored while a layer is still on screen.
  await expect(panel).toBeHidden();
  await expect(replyButton).toBeFocused();
  // R opens it again from the page, with the text still there.
  await page.keyboard.press("r");
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("kx");
  await box.fill("");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  // With single-key shortcuts switched off in this browser (Settings → Account), R does nothing.
  await page.evaluate(() => localStorage.setItem("ft:shortcuts", "off"));
  await page.keyboard.press("r");
  await expect(panel).toBeHidden();
  await page.evaluate(() => localStorage.removeItem("ft:shortcuts"));

  // More is a menu beside the button. While it is open K belongs to it, not to the track; Escape closes it.
  const more = card.getByRole("button", { name: "More", exact: true });
  await more.click();
  const menu = page.getByRole("menu", { name: "More" });
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveText(["Reply", "Download", "Add a note", "Move", "Copy link", "Details", "Report", "Delete"]);
  // It opens on its first item; the arrows wrap, Home and End jump to the ends.
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  // The arrows moved inside the menu only: the open track is the same one.
  await expect(card.locator('h2[id^="track-h-"]')).toHaveText(title);
  await page.keyboard.press("k");
  await expect(card.getByRole("button", { name: /Keep/ })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  // Its items go to what the page already has: the private note opens in the Sender card (owner, 18 Nov) with the
  // cursor in it, and Report opens Details.
  await more.click();
  await menu.getByRole("menuitem", { name: "Add a note" }).click();
  await expect(page.getByLabel("Private note, never sent to the sender")).toBeFocused();
  await more.click();
  await menu.getByRole("menuitem", { name: "Report" }).click();
  await expect(page.getByRole("group", { name: "Report this track" })).toBeVisible();
  // Details and Move go to the card's own controls. Tab closes the menu.
  await more.click();
  await menu.getByRole("menuitem", { name: "Details" }).click();
  await expect(card.locator("details[data-panel-details] summary")).toBeFocused();
  await more.click();
  await menu.getByRole("menuitem", { name: "Move" }).click();
  await expect(card.locator('[id^="move-"]')).toBeFocused();
  await more.click();
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();

  // Copy link copies this track's own Queue address on this site, nothing else.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await more.click();
  await menu.getByRole("menuitem", { name: "Copy link" }).click();
  await expect(page.locator("[data-toast-region]").getByText(/^Link copied/)).toBeVisible();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.origin).toBe(new URL(page.url()).origin);
  expect(copied.pathname).toBe("/dashboard/review");
  expect(copied.searchParams.get("t")).toMatch(/^\d+$/);

  // None of the keys pressed with a layer open saved a decision: the same track is still first and undecided.
  await page.reload();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(title);
  await expect(card.getByRole("button", { name: /Keep/ })).toHaveAttribute("aria-pressed", "false");

  // The BPM head sorts the rows on the page, up then down.
  const bpms = async () => (await list.locator('[role="row"][aria-current], [role="row"]:has(a)').evaluateAll((rows) => rows.map((r) => Number(r.querySelectorAll('[role="cell"]')[4]?.textContent)))).filter((n) => n > 0);
  const bpmHead = list.getByRole("columnheader", { name: "BPM" });
  // The page was just reloaded: a click before the head is hydrated does nothing.
  await hydrated(bpmHead.getByRole("button"));
  await bpmHead.getByRole("button").click();
  await expect(bpmHead).toHaveAttribute("aria-sort", "ascending");
  const up = await bpms();
  expect(up.length).toBeGreaterThan(1);
  expect(up).toEqual(up.toSorted((a, b) => a - b));
  await bpmHead.getByRole("button").click();
  await expect(bpmHead).toHaveAttribute("aria-sort", "descending");
  const down = await bpms();
  expect(down).toEqual(down.toSorted((a, b) => b - a));

  // A row plays its track: the floating bar comes up with it.
  await list.getByRole("link", { name: /^Play / }).first().click();
  await expect(page.locator("[data-player-bar]").getByRole("button", { name: /^Pause / })).toBeVisible();
});

test("phone: story bars, cover taps step between tracks clear of the decision, and the card starts playback", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review?view=queue");
  const card = page.locator("#review-card");
  await expect(card.getByText(/^1 of \d+$/).locator("visible=true")).toBeVisible();
  await expect(card.getByRole("slider")).toHaveCount(0);

  // Every control on the card is at least 44px.
  for (const b of await card.getByRole("group", { name: "Playback" }).getByRole("button").all()) {
    const box = (await b.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }

  // The tap zones sit on the cover only: neither reaches Keep or Not for me.
  const nextZone = (await card.locator('[data-cover-step="next"]').boundingBox())!;
  const keep = (await card.getByRole("button", { name: /Keep/ }).boundingBox())!;
  expect(nextZone.y + nextZone.height).toBeLessThanOrEqual(keep.y);

  const first = await card.getByRole("heading", { level: 2 }).innerText();
  await card.locator('[data-cover-step="next"]').click();
  await expect(card.getByRole("heading", { level: 2 })).not.toHaveText(first);
  await expect(card.getByText(/^2 of \d+$/).locator("visible=true")).toBeVisible();
  await card.locator('[data-cover-step="prev"]').click();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(first);

  // On a phone More and Reply are sheets, every row 44px or more, and closing one puts focus back on its button.
  const more = card.getByRole("button", { name: "More", exact: true });
  await more.click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible();
  for (const b of await sheet.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
  // An item picked from the sheet keeps focus where it sent it: the sheet closing doesn't pull it back to More.
  await more.click();
  await sheet.getByRole("button", { name: "Add a note" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel("Private note, never sent to the sender")).toBeFocused();
  await more.click();
  await sheet.getByRole("button", { name: "Reply" }).click();
  const reply = page.getByRole("dialog", { name: /^Reply to / });
  await expect(reply.getByRole("textbox", { name: /^Your reply to / })).toBeFocused();
  await expect(reply.getByRole("button", { name: "Send reply" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reply).toBeHidden();

  await card.locator("[data-card-play]").click();
  await expect(card.locator("[data-card-play]")).toHaveAccessibleName(/^Pause /);
});
