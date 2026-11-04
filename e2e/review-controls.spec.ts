import type { CDPSession, Locator, Page } from "@playwright/test";
import { expect, hydrated, logIn as logInAs, test as base } from "./fixtures";

/**
 * Every control in the Review Queue (Queue and List views) does what it says (owner, 4 Nov, glass pass page 2): each
 * link lands, each button decides, plays, replies, moves or confirms, the keys work, and a phone can swipe between
 * tracks. Nothing may log a console error, throw, or get a 4xx/5xx answer on the way. Desktop at 1280, phone at 390.
 * Seeded demo desk (scripts/seed.ts). The suite shares one database with the other specs, so every change it makes is
 * put back (Undo, Needs review, moved back, template deleted); the one exception is the last test, which deletes one
 * kept track for real to prove the confirmed Delete.
 */
const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
      page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
      page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.request().method()} ${r.url()}`));
      await use(problems);
      expect(problems, "no console errors, page errors or 4xx/5xx responses").toEqual([]);
    },
    { auto: true },
  ],
});

/** The demo desk, through the shared log-in (it passes the human check a full run's earlier wrong tries can bring up). */
const logIn = (page: Page) => logInAs(page, "demo@floortest.test");

const panel = (page: Page) => page.getByRole("complementary", { name: "Review" });
const rail = (page: Page) => panel(page).getByRole("group", { name: "Decision" });
const openTitle = (page: Page) => panel(page).locator('h2[id^="track-h-"]');
const tabs = (page: Page) => page.getByRole("navigation", { name: "Status" });
const trackList = (page: Page) => page.getByRole("list", { name: "Tracks" });
const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();
/** The open track's id, from the address. */
const openId = (page: Page) => new URL(page.url()).searchParams.get("t");

/** The Queue on a tab, ready for keys and taps (React owns the rail). */
async function queue(page: Page, query = "") {
  await page.goto(`/dashboard/review?view=queue${query}`);
  await hydrated(rail(page).getByRole("button").first());
}

/** The List view, ready for keys. */
async function list(page: Page, query = "") {
  await page.goto(`/dashboard/review?view=list${query}`);
  await hydrated(page.getByRole("button", { name: "Select", exact: true }));
}

/** Clicks off any control so the page's own key listener gets the next key. */
const blur = (page: Page) => page.locator("body").click({ position: { x: 1, y: 1 } });

/** The open track's waveform position, 0–100 (the DetailPlayer slider's aria-valuenow). */
async function position(page: Page) {
  const title = (await openTitle(page).textContent())!.trim();
  return Number(await panel(page).getByRole("slider", { name: `Seek ${title}` }).getAttribute("aria-valuenow"));
}

test.describe("Review Queue controls, desktop 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(async ({ page }) => logIn(page));

  test("toggle: Queue and List switch the layout", async ({ page }) => {
    await queue(page);
    await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "List" }).click();
    await page.waitForURL((u) => u.searchParams.get("view") === "list");
    await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
    await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "Queue" }).click();
    await page.waitForURL((u) => u.searchParams.get("view") === "queue");
    await expect(rail(page)).toBeVisible();
  });

  test("tabs: each status tab opens its list and lights up", async ({ page }) => {
    await queue(page);
    for (const [label, s] of [["Kept", "kept"], ["Not for me", "passed"], ["All", "all"], ["Needs review", null]] as const) {
      const tab = tabs(page).getByRole("link", { name: new RegExp(`^${label} \\d+$`) });
      await tab.click();
      await page.waitForURL((u) => u.searchParams.get("s") === s);
      await expect(tab).toHaveAttribute("aria-current", "page");
    }
  });

  test("tabs: the list fades while a tab loads (the selector reaches the list)", async ({ page }) => {
    await queue(page);
    const listArea = page.locator(".review-list");
    await expect(listArea).toHaveCSS("opacity", "1");
    // StatusTabs sets data-pending for the length of the transition; set it by hand so the check doesn't race the server.
    await tabs(page).evaluate((nav) => nav.setAttribute("data-pending", ""));
    await expect(listArea).toHaveCSS("opacity", "0.45");
    await expect(listArea).toHaveCSS("pointer-events", "none");
    await tabs(page).evaluate((nav) => nav.removeAttribute("data-pending"));
    await expect(listArea).toHaveCSS("opacity", "1");
  });

  test("filter: the Collection menu narrows the queue and clears", async ({ page }) => {
    await queue(page, "&s=all");
    const menu = page.getByRole("button", { name: /^Collection/ });
    await menu.click();
    await page.getByRole("menuitemradio", { name: /Villagers callout/ }).click();
    await page.waitForURL((u) => !!u.searchParams.get("c"));
    await expect(menu).toContainText("Villagers callout");
    await menu.click();
    await page.getByRole("menuitemradio", { name: "All collections" }).click();
    await page.waitForURL((u) => !u.searchParams.get("c"));
    // Esc closes the menu without choosing.
    await menu.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("search: finds a track by title, and says when nothing matches", async ({ page }) => {
    await queue(page, "&s=all");
    const title = (await openTitle(page).textContent())!.trim();
    await page.getByRole("searchbox", { name: "Search tracks" }).or(page.getByLabel("Search tracks")).first().fill(title);
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.searchParams.get("q") === title);
    await expect(trackList(page).locator('a[href*="t="]').filter({ hasText: title }).first()).toBeVisible();
    await page.getByLabel("Search tracks").fill("no-track-is-called-this");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Nothing matches “no-track-is-called-this”.")).toBeVisible();
  });

  test("row: a track's row opens it in the panel", async ({ page }) => {
    await queue(page, "&s=all");
    const row = trackList(page).locator('a[href*="t="]').nth(1);
    const title = (await row.locator("span").first().textContent())!.trim();
    await row.click();
    await expect(openTitle(page)).toHaveText(title);
    await page.waitForURL((u) => !!u.searchParams.get("t"));
  });

  test("row: a row's play button plays and pauses that track", async ({ page }) => {
    await queue(page, "&s=all");
    const play = trackList(page).getByRole("button", { name: /^Play / }).first();
    const title = (await play.getAttribute("aria-label"))!.replace(/^Play /, "");
    await play.click();
    await expect(trackList(page).getByRole("button", { name: `Pause ${title}` })).toBeVisible();
    await trackList(page).getByRole("button", { name: `Pause ${title}` }).click();
    await expect(trackList(page).getByRole("button", { name: `Play ${title}` })).toBeVisible();
  });

  test("stepper: Next and Previous move through the tracks", async ({ page }) => {
    await queue(page, "&s=all");
    const first = (await openTitle(page).textContent())!.trim();
    await panel(page).getByRole("button", { name: "Next track" }).click();
    await expect(openTitle(page)).not.toHaveText(first);
    await panel(page).getByRole("button", { name: "Previous track" }).click();
    await expect(openTitle(page)).toHaveText(first);
  });

  test("player: Play, seek on the waveform, Pause", async ({ page }) => {
    await queue(page);
    await panel(page).getByRole("button", { name: "Play", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const title = (await openTitle(page).textContent())!.trim();
    const wave = panel(page).getByRole("slider", { name: `Seek ${title}` });
    const box = (await wave.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
    await expect.poll(() => position(page)).toBeGreaterThanOrEqual(50);
    await panel(page).getByRole("button", { name: "Pause", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  });

  test("decide: Not for me and Keep, each put back with Undo", async ({ page }) => {
    await queue(page);
    for (const [name, said] of [[/^Not for me/, /^Not for me: “/], [/^Keep/, /added to Prepare for set/]] as const) {
      const id = openId(page) ?? (await panel(page).locator('h2[id^="track-h-"]').getAttribute("id"))!.replace("track-h-", "");
      await rail(page).getByRole("button", { name }).click();
      await toast(page, said);
      await page.getByRole("button", { name: "Undo" }).first().click();
      await page.waitForURL((u) => u.searchParams.get("t") === id);
      await queue(page);
    }
  });

  test("keys: X and K decide, U undoes, J and the arrows move", async ({ page }) => {
    await queue(page);
    await blur(page);
    await page.keyboard.press("x");
    await toast(page, /^Not for me: “/);
    await page.keyboard.press("u");
    await expect(page.getByText(/^Not for me: “/)).toHaveCount(0);
    await queue(page);
    await blur(page);
    await page.keyboard.press("k");
    await toast(page, /added to Prepare for set/);
    await page.keyboard.press("u");
    await expect(page.getByText(/added to Prepare for set/)).toHaveCount(0);

    await queue(page, "&s=all");
    await blur(page);
    const first = (await openTitle(page).textContent())!.trim();
    await page.keyboard.press("j");
    await expect(openTitle(page)).not.toHaveText(first);
    await page.keyboard.press("ArrowUp");
    await expect(openTitle(page)).toHaveText(first);
    await page.keyboard.press("ArrowDown");
    await expect(openTitle(page)).not.toHaveText(first);
  });

  test("keys: Space plays, 1–4 jump, ←/→ seek ten seconds", async ({ page }) => {
    await queue(page);
    await blur(page);
    await page.keyboard.press("Space");
    await expect(panel(page).getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    for (const [key, at] of [["1", 25], ["2", 50], ["3", 75], ["4", 90]] as const) {
      await page.keyboard.press(key);
      await expect.poll(() => position(page)).toBeGreaterThanOrEqual(at - 2);
    }
    await page.keyboard.press("2");
    await expect.poll(() => position(page)).toBeLessThan(65);
    const before = await position(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => position(page)).toBeGreaterThan(before + 10);
    const later = await position(page);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => position(page)).toBeLessThan(later - 10);
    await page.keyboard.press("Space");
    await expect(panel(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();
  });

  test("reply: R jumps in, Esc steps out, quick replies and Cancel fill and clear", async ({ page }) => {
    await queue(page);
    const box = page.locator("#reply-body");
    await blur(page);
    await page.keyboard.press("r");
    await expect(box).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(box).not.toBeFocused();
    await page.getByRole("group", { name: "Quick replies" }).or(page.locator('[aria-label="Quick replies"]')).first().getByRole("button", { name: "Interested" }).click();
    await expect(box).toHaveValue(/^Thanks .+, I'm into this one/);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(box).toHaveValue("");
  });

  test("reply: save a template, insert it, delete it", async ({ page }) => {
    await queue(page);
    const box = page.locator("#reply-body");
    const text = `Template from the review controls test ${Date.now()}`;
    await box.fill(text);
    const templates = page.getByRole("button", { name: /^Templates/ });
    await templates.click();
    await page.getByRole("button", { name: "+ Save current reply as a template" }).click();
    await expect(page.getByRole("button", { name: text })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(box).toHaveValue("");
    if ((await templates.getAttribute("aria-expanded")) !== "true") await templates.click();
    await page.getByRole("button", { name: text }).click();
    await expect(box).toHaveValue(text);
    await templates.click();
    const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: text }) });
    await row.getByRole("button", { name: "Delete template" }).click();
    await expect(page.getByRole("button", { name: text })).toHaveCount(0);
  });

  test("reply: ⌘/Ctrl+Enter and Send reply both send", async ({ page }) => {
    await queue(page);
    const box = page.locator("#reply-body");
    // A full run has already sent replies to these senders (reply-feedback.spec), so the daily limit may refuse one:
    // either answer counts, as long as it is said, and a refused reply keeps its text (sent ones clear the box).
    const sent = /Reply emailed to|Already sent|Not sent/;
    const answered = async (text: string) => {
      const said = page.getByText(sent).first();
      await expect(said).toBeVisible();
      await expect(box).toHaveValue(/^Not sent/.test((await said.textContent()) ?? "") ? text : "");
      // One toast at a time (6 s): wait for it to go so the next answer is a new one.
      await expect(page.getByText(sent)).toHaveCount(0, { timeout: 15_000 });
    };
    const first = `Thanks, this one is on my list (keys ${Date.now()}).`;
    await box.fill(first);
    await box.press("ControlOrMeta+Enter");
    await answered(first);
    const second = `Thanks, I'll play it this weekend (button ${Date.now()}).`;
    await box.fill(second);
    await page.getByRole("button", { name: "Send reply" }).click();
    await answered(second);
  });

  test("details: open, Download original, Move and move back, Delete asks first", async ({ page }) => {
    await queue(page);
    const details = panel(page).locator("details").filter({ has: page.locator("summary", { hasText: "Details" }) });
    if (!(await details.getAttribute("open"))) await details.locator("summary").first().click();
    await expect(details).toHaveAttribute("open", "");

    const download = details.getByRole("link", { name: "Download original" });
    const res = await page.request.get((await download.getAttribute("href"))!);
    expect(res.status()).toBe(200);

    const select = details.getByRole("combobox", { name: "Collection" });
    const from = await select.inputValue();
    const options = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const to = options.find((v) => v && v !== from)!;
    await select.selectOption(to);
    await details.getByRole("button", { name: "Move" }).click();
    await expect(select).toHaveValue(to);
    await select.selectOption(from);
    await details.getByRole("button", { name: "Move" }).click();
    await expect(select).toHaveValue(from);

    await details.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(openTitle(page)).toBeVisible();
  });

  test("details: the sender links land on their history", async ({ page }) => {
    await queue(page);
    await panel(page).locator('h3[id^="from-h-"]').getByRole("link").click();
    await page.waitForURL(/\/dashboard\/contacts\/\d+$/);
    await expect(page.locator("#main h1").first()).toBeVisible();
  });

  test("list: every filter menu filters and clears, search narrows", async ({ page }) => {
    await list(page);
    for (const [label, param] of [["Status", "s"], ["Collection", "c"], ["Type", "type"], ["Genre", "genre"], ["BPM", "bpm"], ["Sender", "sender"]] as const) {
      await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
      const items = page.getByRole("menuitemradio");
      await items.nth(1).click();
      await page.waitForURL((u) => u.searchParams.has(param) || (param === "sender" && u.searchParams.has("verified")));
      await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
      await page.getByRole("menuitemradio").first().click();
      await page.waitForURL((u) => !u.searchParams.has(param) && !u.searchParams.has("verified"));
    }
    const search = page.getByLabel("Search", { exact: true });
    await search.fill("no-track-is-called-this");
    await search.press("Enter");
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
    await page.getByRole("link", { name: "Clear them" }).click();
    await page.waitForURL((u) => !u.searchParams.has("q"));
  });

  test("list: Select, Select all, the batch bar, Done", async ({ page }) => {
    await list(page);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("checkbox", { name: "Select all tracks" }).check();
    const bar = page.getByRole("region", { name: "Selected tracks" });
    await expect(bar).toContainText(/\d+ selected/);
    await page.getByRole("checkbox", { name: "Select all tracks" }).uncheck();
    await expect(bar).toHaveCount(0);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
  });

  test("list: a row opens inline, replies, closes and opens the full review", async ({ page }) => {
    await list(page, "&s=all");
    const rows = page.getByRole("list", { name: "Review Queue" });
    const name = rows.locator("button[aria-expanded]").filter({ visible: true }).first();
    await name.click();
    await expect(name).toHaveAttribute("aria-expanded", "true");
    const area = rows.locator("textarea").first();
    await expect(area).toBeFocused();
    await rows.getByRole("button", { name: "Interested" }).click();
    await expect(area).toHaveValue(/^Thanks /);
    await rows.getByRole("button", { name: "Close" }).click();
    await expect(name).toHaveAttribute("aria-expanded", "false");
    await name.click();
    await rows.getByRole("link", { name: "Open full review →" }).click();
    await page.waitForURL((u) => u.searchParams.get("view") === "queue" && !!u.searchParams.get("t"));
  });

  test("list: Keep on a row, then Keep again clears it", async ({ page }) => {
    // All tracks: a kept track stays in the list (Needs review would drop it on the refresh).
    await list(page, "&s=all");
    const keep = page.getByRole("button", { name: /^Keep / }).filter({ visible: true }).first();
    const label = (await keep.getAttribute("aria-label"))!;
    await keep.click();
    await expect(page.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    await toast(page, /added to Prepare for set/);
    await page.getByRole("button", { name: label }).click();
    await toast(page, /is back in Needs review/);
    await expect(page.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
  });

  test("list: keys select, play, keep, undo, open and jump", async ({ page }) => {
    await list(page, "&s=all");
    const rows = page.getByRole("list", { name: "Review Queue" });
    await blur(page);
    await page.keyboard.press("ArrowDown");
    await expect(rows.locator('li[aria-current="true"]')).toHaveCount(1);
    const first = await rows.locator('li[aria-current="true"]').getAttribute("data-row");
    await page.keyboard.press("j");
    await expect(rows.locator('li[aria-current="true"]')).not.toHaveAttribute("data-row", first!);
    await page.keyboard.press("ArrowUp");
    await expect(rows.locator('li[aria-current="true"]')).toHaveAttribute("data-row", first!);

    await page.keyboard.press("Space");
    await expect(page.locator("[data-player-bar]")).toBeVisible();
    const slider = rows.locator(`li[data-row="${first}"]`).getByRole("slider");
    for (const [key, at] of [["1", 25], ["3", 75]] as const) {
      await page.keyboard.press(key);
      await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(at - 2);
    }
    // From a quarter in, so the 32 s track can't run out under a slow machine while the arrows are checked.
    await page.keyboard.press("1");
    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeLessThan(45);
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(50);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeLessThan(50);

    await page.keyboard.press("k");
    await toast(page, /added to Prepare for set/);
    await page.keyboard.press("u");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("x");
    await toast(page, /^Not for me: “/);
    await page.keyboard.press("u");

    await page.keyboard.press("Enter");
    const area = rows.locator("textarea").first();
    await expect(area).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(rows.locator("textarea")).toHaveCount(0);
    await page.keyboard.press("r");
    await expect(rows.locator("textarea").first()).toBeFocused();
  });

  test("list: the row waveform seeks", async ({ page }) => {
    await list(page, "&s=all");
    const slider = page.getByRole("list", { name: "Review Queue" }).getByRole("slider").filter({ visible: true }).first();
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
    await expect(page.locator("[data-player-bar]")).toBeVisible();
    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(60);
  });

  test("focus shows on every control in the queue (keyboard only)", async ({ page }) => {
    await queue(page);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const shown = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return true;
        const s = getComputedStyle(el);
        return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 ? true : `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)}`;
      });
      expect(shown, "focus ring visible").toBe(true);
    }
  });
});

/** A one-finger horizontal swipe on the review column, through the browser's own touch input. */
async function swipe(page: Page, cdp: CDPSession, zone: Locator, dx: number) {
  const box = (await zone.locator('h2[id^="track-h-"]').boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = dx < 0 ? box.x + box.width - 10 : box.x + 10;
  const point = (x: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x0) });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x0 + (dx * i) / 8) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("Review Queue controls, phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ page }) => logIn(page));

  test("swipe: left for the next track, right for the previous one", async ({ page }) => {
    await queue(page, "&s=all");
    const cdp = await page.context().newCDPSession(page);
    const zone = page.locator("[data-swipe-zone]");
    const first = (await openTitle(page).textContent())!.trim();
    await swipe(page, cdp, zone, -220);
    await expect(openTitle(page)).not.toHaveText(first);
    await page.waitForURL((u) => !!u.searchParams.get("t"));
    await hydrated(rail(page).getByRole("button").first());
    await swipe(page, cdp, zone, 220);
    await expect(openTitle(page)).toHaveText(first);
  });

  test("tap: stepper, Not for me with Undo, the tabs", async ({ page }) => {
    await queue(page, "&s=all");
    const first = (await openTitle(page).textContent())!.trim();
    await panel(page).getByRole("button", { name: "Next track" }).tap();
    await expect(openTitle(page)).not.toHaveText(first);
    await panel(page).getByRole("button", { name: "Previous track" }).tap();
    await expect(openTitle(page)).toHaveText(first);

    await queue(page);
    await rail(page).getByRole("button", { name: /^Not for me/ }).tap();
    await toast(page, /^Not for me: “/);
    const id = (await openTitle(page).getAttribute("id"))!.replace("track-h-", "");
    await page.getByRole("button", { name: "Undo" }).first().tap();
    // Undo puts the track back on screen; wait for that before the next tap.
    await page.waitForURL((u) => u.searchParams.get("t") === id);
    await queue(page);
    await tabs(page).getByRole("link", { name: /^Kept \d+$/ }).tap();
    await page.waitForURL((u) => u.searchParams.get("s") === "kept");
  });

  test("list: the Filter sheet filters, Clear all, Close", async ({ page }) => {
    await list(page);
    await page.getByRole("button", { name: /^Filter/ }).tap();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("region", { name: "Genre" }).or(sheet.locator('section[aria-label="Genre"]')).first().getByRole("link").nth(1).tap();
    await page.waitForURL((u) => u.searchParams.has("genre"));
    // The sheet stays open so several filters can be picked; Show closes it.
    await sheet.getByRole("button", { name: /^Show \d+ tracks?$/ }).tap();
    await expect(sheet).toBeHidden();
    await page.getByRole("button", { name: /^Filter/ }).tap();
    await sheet.getByRole("link", { name: "Clear all" }).tap();
    await page.waitForURL((u) => !u.searchParams.has("genre"));
    await sheet.getByRole("button", { name: "Close filters" }).tap();
    await expect(sheet).toBeHidden();
  });

  test("list: a row opens the track in the Queue", async ({ page }) => {
    await list(page, "&s=all");
    await page.getByRole("list", { name: "Review Queue" }).locator('a[href*="view=queue"]').filter({ visible: true }).first().tap();
    await page.waitForURL((u) => u.searchParams.get("view") === "queue" && !!u.searchParams.get("t"));
    await expect(rail(page)).toBeVisible();
  });

  test("list: the batch bar sits above the tab bar, on screen, with a visible focus ring", async ({ page }) => {
    await list(page, "&s=all");
    await page.getByRole("button", { name: "Select", exact: true }).tap();
    // The rows' boxes, not Select all.
    const boxes = page.getByRole("list", { name: "Review Queue" }).getByRole("checkbox").filter({ visible: true });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    const bar = page.getByRole("region", { name: "Selected tracks" });
    await expect(bar).toContainText("2 selected");
    const b = (await bar.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(844);
    const tabbar = await page.locator("nav[data-tabbar]").boundingBox();
    if (tabbar) expect(b.y + b.height).toBeLessThanOrEqual(tabbar.y + 1);
    // Glass doesn't hide the focus ring: Tab (a keyboard, so :focus-visible applies) into the bar.
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!document.activeElement?.closest("[data-batch-bar]"))); i++) await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { inBar: !!el.closest("[data-batch-bar]"), style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.inBar).toBe(true);
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Done" }).tap();
    await expect(bar).toHaveCount(0);
  });

  test("tap targets: every Queue control is at least 44px tall", async ({ page }) => {
    await queue(page);
    const small = await page.locator("#main").evaluate((main) =>
      [...main.querySelectorAll<HTMLElement>("a[href], button, select, input:not([type=hidden]), summary")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden=true]");
        })
        // A row's link stretches over its whole row (an absolute ::after), so the row is the target.
        .map((el) => (getComputedStyle(el, "::after").position === "absolute" && el.closest("li") ? el.closest("li")! : el) as HTMLElement)
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map((el) => `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}px`),
    );
    expect(small).toEqual([]);
  });
});

test.describe("Review Queue, the confirmed Delete (runs last: it removes a kept track for good)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Delete, confirmed, removes the file and moves on", async ({ page }) => {
    await logIn(page);
    await queue(page, "&s=kept");
    const title = (await openTitle(page).textContent())!.trim();
    const details = panel(page).locator("details").filter({ has: page.locator("summary", { hasText: "Details" }) });
    if (!(await details.getAttribute("open"))) await details.locator("summary").first().click();
    await details.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete file" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/dashboard/review?view=queue&s=all");
    // Matched as text, not a regex built from the title (CodeQL js/incomplete-sanitization).
    await expect(trackList(page).locator('a[href*="t="]').filter({ hasText: title })).toHaveCount(0);
  });
});
