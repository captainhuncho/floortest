import type { Locator, Page } from "@playwright/test";
import { expect, hydrated, test as base } from "./fixtures";

/**
 * Every control on the Floor, and the desk chrome around it, does what it says (owner, 3 Nov, the glass pass): each
 * link lands on its page, each button opens, plays, copies or switches, keys reach and work them, and nothing logs a
 * console error, throws, or gets a 4xx/5xx answer on the way. Desktop at 1280 and a phone at 390. Run before and after
 * a Floor redesign so a restyle can't quietly break a control. Seeded demo desk (scripts/seed.ts).
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

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
}

async function floor(page: Page) {
  await page.goto("/dashboard/floor");
  await hydrated(page.locator("#main h1").first());
  await hydrated(upNext(page).getByRole("button", { name: /^Play / }).first());
}

const main = (page: Page) => page.locator("#main");
const upNext = (page: Page) => page.locator('section[aria-labelledby="next-h"]');
const desk = (page: Page) => page.getByRole("region", { name: "Your desk" });
/** The top bar's account button (initials, "Your profile"). */
const account = (page: Page) => page.getByRole("button", { name: /Your profile/ }).filter({ visible: true }).first();

/** The page is at exactly this path and query (an href read off the page), compared as strings, no regex. */
const at = (href: string) => (u: URL) => u.pathname + u.search === href;

/**
 * Clicks a link and checks it lands on its page (any 4xx/5xx on the way fails the test through `problems`). A string
 * is an href read off the page and must match exactly.
 */
async function lands(page: Page, link: Locator, url: RegExp | string) {
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(typeof url === "string" ? at(url) : url);
  await expect(page.locator("#main h1").first()).toBeVisible();
}

test.describe("Floor controls, desktop 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await floor(page);
  });

  const links: [string, (p: Page) => Locator, RegExp][] = [
    ["Act now: Waiting (the oldest track, Start listening)", (p) => main(p).getByRole("link", { name: /^Waiting \d+ (Oldest|Arrived) · .*Start listening/ }), /\/dashboard\/review\?view=queue$/],
    ["Up next: All / Open the queue", (p) => upNext(p).getByRole("link", { name: /^(All \d+|Open the queue)/ }), /\/dashboard\/review\?view=queue$/],
    ["Up next: Start with the oldest", (p) => upNext(p).getByRole("link", { name: /^(Start with the oldest|Listen now)$/ }), /\/dashboard\/review\?view=queue$/],
    ["Just in: a track's title", (p) => upNext(p).locator('a[href*="view=queue&t="]').first(), /\/dashboard\/review\?view=queue&t=\d+/],
    ["Kept for your set: Prepare", (p) => main(p).getByRole("link", { name: "Prepare", exact: true }), /\/dashboard\/prepare$/],
    ["Your desk: tracks used", (p) => desk(p).getByRole("link", { name: /of \d+ tracks/ }), /\/dashboard\/(account|prepare)$/],
    ["Your desk: Collections", (p) => desk(p).getByRole("link", { name: /^Collections/ }), /\/dashboard\/collections$/],
    ["Your desk: Contacts", (p) => desk(p).getByRole("link", { name: /^Contacts/ }), /\/dashboard\/contacts$/],
    ["Your desk: Plan", (p) => desk(p).getByRole("link", { name: /^Plan/ }), /\/dashboard\/plans$/],
    ["Send music: Send to someone new", (p) => main(p).getByRole("link", { name: "Send to someone new" }), /\/dashboard\/send$/],
    ["Top bar: account", (p) => account(p), /\/dashboard\/account$/],
  ];
  for (const [name, find, url] of links) test(`link: ${name}`, async ({ page }) => lands(page, find(page), url));

  test("links: every step of Get your desk running", async ({ page }) => {
    const steps = page.locator('section[aria-labelledby="onboard-h"] a[href]');
    const hrefs = await steps.evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      await floor(page);
      await lands(page, page.locator(`section[aria-labelledby="onboard-h"] a[href="${href}"]`).first(), href);
    }
  });

  test("links: every place in the side menu", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first();
    const hrefs = await nav.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const href of hrefs) {
      await floor(page);
      await lands(page, nav.locator(`a[href="${href}"]`), href);
    }
  });

  test("link: the FloorTest logo goes home", async ({ page }) => {
    await page.getByRole("link", { name: /FloorTest/ }).filter({ visible: true }).first().click();
    await page.waitForURL((u) => u.pathname === "/");
  });

  test("button: Up next play, seek and pause", async ({ page }) => {
    const play = upNext(page).getByRole("button", { name: /^Play / }).first();
    const title = (await play.getAttribute("aria-label"))!.replace(/^Play /, "");
    await play.click();
    await expect(upNext(page).getByRole("button", { name: `Pause ${title}` })).toBeVisible();
    await upNext(page).getByLabel(`Seek ${title}`).click();
    await upNext(page).getByRole("button", { name: `Pause ${title}` }).click();
    await expect(upNext(page).getByRole("button", { name: `Play ${title}` }).first()).toBeVisible();
  });

  test("buttons: Just in play each track", async ({ page }) => {
    const plays = upNext(page).locator("ul").getByRole("button", { name: /^Play / });
    const n = await plays.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = plays.nth(i);
      const title = (await b.getAttribute("aria-label"))!.replace(/^Play /, "");
      await b.click();
      await expect(upNext(page).getByRole("button", { name: `Pause ${title}` }).last()).toBeVisible();
    }
  });

  test("button: Copy your link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await desk(page).getByRole("button", { name: /^Copy your link/ }).click();
    await expect(page.getByText("Your link is copied. Paste it anywhere.")).toBeVisible();
  });

  test("button: Share your link (copies where there's no share sheet)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await desk(page).getByRole("button", { name: "Share your link" }).click();
    await expect(page.getByText("Your link is copied. Paste it anywhere.")).toBeVisible();
  });

  test("tabs: This week Received, Kept, Listened", async ({ page }) => {
    const tabs = page.getByRole("tablist", { name: "Show" });
    for (const name of ["Kept", "Listened", "Received"]) {
      await tabs.getByRole("tab", { name }).click();
      await expect(tabs.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    }
  });

  test("form: Send music searches by handle", async ({ page }) => {
    const field = page.locator("#send-to-q");
    test.skip(!(await field.isVisible()), "Send music is switched off for this desk");
    await field.fill("tiateams");
    await field.press("Enter");
    await page.waitForURL(/\/dashboard\/send\?/);
  });

  test("menu: Feedback opens, validates empty, Esc closes", async ({ page }) => {
    await page.getByRole("button", { name: "Feedback", exact: true }).filter({ visible: true }).first().click();
    const form = page.getByRole("form", { name: "Help shape FloorTest" });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: /^Send/ }).click();
    expect(await form.getByLabel("Feedback").evaluate((t: HTMLTextAreaElement) => t.validity.valueMissing)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(form).toBeHidden();
  });

  test("menu: Search opens and Esc closes", async ({ page }) => {
    const search = page.getByRole("button", { name: "Search (⌘K)" }).filter({ visible: true }).first();
    await search.click();
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Search tracks, artists or contacts")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(search).toHaveAttribute("aria-expanded", "false");
  });

  test("menu: Notifications opens and Esc closes", async ({ page }) => {
    const bell = page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true }).first();
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  // By keyboard: in the dev server, Next's own indicator sits over this corner and takes the pointer.
  test("toggle: Pin menu open", async ({ page }) => {
    const pin = page.getByRole("button", { name: "Pin menu open" });
    await pin.focus();
    await page.keyboard.press("Enter");
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(pin).toHaveAttribute("aria-pressed", "false");
  });

  test("keyboard: Tab reaches every Floor control; Enter, Space and Esc work", async ({ page }) => {
    const reached = new Set<string>();
    await page.locator("body").focus();
    for (let i = 0; i < 140; i++) {
      await page.keyboard.press("Tab");
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim() : "";
      });
      if (name) reached.add(name);
    }
    const names = [...reached];
    for (const want of [/^(All \d+|Open the queue)/, /^Play /, /^(Start with the oldest|Listen now)$/, /^Prepare$/, /^Copy your link/, /^Share your link$/, /^Received$/, /^Kept$/, /^Listened$/, /^Collections/, /^Contacts/, /^Plan/, /^Feedback$/, /^Search \(⌘K\)$/, /^Notifications/, /^Hide this$/])
      expect(names.some((n) => want.test(n)), `Tab reaches ${want}`).toBe(true);

    // Space switches a tab; Esc closes a menu opened with Enter; Enter follows a link.
    await page.getByRole("tab", { name: "Kept" }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("tab", { name: "Kept" })).toHaveAttribute("aria-selected", "true");
    const search = page.getByRole("button", { name: "Search (⌘K)" }).filter({ visible: true }).first();
    await search.focus();
    await page.keyboard.press("Enter");
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(search).toHaveAttribute("aria-expanded", "false");
    await upNext(page).getByRole("link", { name: /^(Start with the oldest|Listen now)$/ }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/dashboard\/review\?view=queue$/);
  });

  // Last: it hides the checklist on the demo desk for the rest of this run.
  test("button: Hide this (the checklist)", async ({ page }) => {
    await page.getByRole("button", { name: "Hide this" }).click();
    await expect(page.locator('section[aria-labelledby="onboard-h"]')).toHaveCount(0);
  });
});

test.describe("Floor controls, phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await floor(page);
  });

  test("links: the tab bar's four places", async ({ page }) => {
    const bar = page.locator("nav[data-tabbar]");
    const hrefs = await bar.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs).toHaveLength(4);
    for (const href of hrefs) {
      await floor(page);
      await bar.locator(`a[href="${href}"]`).tap();
      await page.waitForURL(at(href));
      await expect(bar.locator(`a[href="${href}"]`)).toHaveAttribute("aria-current", "page");
    }
  });

  test("link: Start with the oldest", async ({ page }) => {
    await upNext(page).getByRole("link", { name: /^(Start with the oldest|Listen now)$/ }).tap();
    await page.waitForURL(/\/dashboard\/review\?view=queue$/);
  });

  test("link: Up next All / Open the queue", async ({ page }) => {
    await upNext(page).getByRole("link", { name: /^(All \d+|Open the queue)/ }).tap();
    await page.waitForURL(/\/dashboard\/review\?view=queue$/);
  });

  test("button: Up next play and pause", async ({ page }) => {
    const play = upNext(page).getByRole("button", { name: /^Play / }).first();
    const title = (await play.getAttribute("aria-label"))!.replace(/^Play /, "");
    await play.tap();
    await expect(upNext(page).getByRole("button", { name: `Pause ${title}` })).toBeVisible();
    await upNext(page).getByRole("button", { name: `Pause ${title}` }).tap();
  });

  test("button: Copy your link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await desk(page).getByRole("button", { name: /^Copy your link/ }).tap();
    await expect(page.getByText("Your link is copied. Paste it anywhere.")).toBeVisible();
  });

  test("menus: Feedback, Search and Notifications open and close", async ({ page }) => {
    await page.getByRole("button", { name: "Feedback", exact: true }).filter({ visible: true }).first().tap();
    await expect(page.getByRole("form", { name: "Help shape FloorTest" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("form", { name: "Help shape FloorTest" })).toBeHidden();
    const search = page.getByRole("button", { name: "Search (⌘K)" }).filter({ visible: true }).first();
    await search.tap();
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(search).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true }).first().tap();
    await expect(page.getByRole("button", { name: "Close notifications" })).toBeVisible();
    await page.getByRole("button", { name: "Close notifications" }).tap();
    await expect(page.getByRole("button", { name: "Close notifications" })).toHaveCount(0);
  });

  test("link: account from the top bar", async ({ page }) => {
    await account(page).tap();
    await page.waitForURL(/\/dashboard\/account$/);
  });

  test("tap targets: every Floor control is at least 44px tall", async ({ page }) => {
    const small = await main(page).locator("a[href], button, [role=tab], input").filter({ visible: true }).evaluateAll((els) =>
      els.filter((e) => e.getBoundingClientRect().height < 44 && !e.closest("[aria-hidden=true]")).map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} ${(e.getAttribute("aria-label") || (e as HTMLElement).innerText).replace(/\s+/g, " ").trim().slice(0, 40)}`.trim()),
    );
    expect(small).toEqual([]);
  });
});
