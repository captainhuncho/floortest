import type { Browser, Page } from "@playwright/test";
import { expect, FAKE_TURNSTILE, test } from "./fixtures";

/**
 * Collection share links, end to end (sharing is switched on only in the test copy: SEED_SHARING in playwright.config.ts).
 * The owner makes a link and adds one person; that person gets in after the notice; a stranger can only ask, and gets
 * in once approved; Reset ends the old address for everyone.
 */
test.describe.configure({ mode: "serial" });

const PW = "floortest-demo";
let shareUrl = "";

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await submitLogin(page, email, /\/dashboard\//);
}

/** Fills the log-in form already on screen; if the human check appears (see the guards spec), logs in again with it. */
async function submitLogin(page: Page, email: string, landing: RegExp) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PW);
  await page.getByRole("button", { name: "Log in" }).click();
  const dashboard = page.waitForURL(landing, { timeout: 60_000 }).then(() => "in" as const);
  const check = page.getByTestId("turnstile").waitFor({ state: "attached", timeout: 60_000 }).then(() => "check" as const, () => "none" as const);
  // The check may already be on screen with a token (then the first click got through): retry only if still here.
  if ((await Promise.race([dashboard, check])) === "check" && !(await page.waitForURL(landing, { timeout: 5_000 }).then(() => true, () => false))) {
    await page.getByRole("textbox", { name: "Password" }).fill(PW);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(landing);
  }
  await dashboard.catch(() => {});
}

async function asUser(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
  await logIn(page, email);
  return { ctx, page };
}

async function openVillagers(page: Page) {
  await page.goto("/dashboard/collections");
  await page.getByRole("link", { name: /Villagers callout/ }).first().click();
  await page.waitForURL(/\/dashboard\/collections\/\d+/);
}

test("the owner makes a share link and adds one listener", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await openVillagers(page);
  await page.getByRole("button", { name: "New share link" }).click();
  await page.getByRole("button", { name: "Make link" }).click();
  const box = page.getByRole("textbox", { name: "New share link" });
  await expect(box).toBeVisible();
  shareUrl = await box.inputValue();
  expect(shareUrl).toMatch(/\/c\/[A-Za-z0-9_-]{20,}$/);
  await page.getByRole("textbox", { name: "Add people" }).fill("@lena");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("listener@floortest.test").or(page.getByText("@lena")).first()).toBeVisible();
});

test("someone without a session sees only whose collection it is", async ({ page }) => {
  await page.goto(new URL(shareUrl).pathname);
  await expect(page.getByRole("heading", { name: /A private collection from/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("the listener on the list accepts the notice and hears the music", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, "listener@floortest.test");
  const path = new URL(shareUrl).pathname;
  await page.goto(path);
  await page.getByRole("checkbox", { name: "I understand and agree." }).check();
  await page.getByRole("button", { name: "Open the collection" }).click();
  await expect(page.getByText(/opened as listener@floortest.test/)).toBeVisible();
  const src = await page.locator("audio").first().getAttribute("src");
  expect(src).toBeTruthy();
  expect((await page.request.get(src!)).status()).toBe(200);
  // Listen-only: no download, and the download address refuses.
  await expect(page.getByRole("link", { name: "Download original" })).toHaveCount(0);
  expect((await page.request.get(src!.replace(/\/audio$/, "/download"))).status()).toBe(404);
  await ctx.close();
});

test("a stranger can only ask; once approved they get in", async ({ browser, page }) => {
  const stranger = await asUser(browser, "stranger@floortest.test");
  const path = new URL(shareUrl).pathname;
  await stranger.page.goto(path);
  await stranger.page.getByLabel("Your name").fill("Sam Stranger");
  await stranger.page.getByRole("button", { name: "Ask for access" }).click();
  await expect(stranger.page.getByText(/Request sent/)).toBeVisible();
  // The audio stays shut while they wait.
  expect((await stranger.page.request.get(`/api/c${path.slice(2)}/tracks/1/audio`)).status()).toBeGreaterThanOrEqual(400);

  await logIn(page, "demo@floortest.test");
  await openVillagers(page);
  await expect(page.getByText(/stranger@floortest.test · via this link/)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await stranger.page.goto(path);
  await stranger.page.getByRole("checkbox", { name: "I understand and agree." }).check();
  await stranger.page.getByRole("button", { name: "Open the collection" }).click();
  await expect(stranger.page.getByText(/opened as stranger@floortest.test/)).toBeVisible();
  await stranger.ctx.close();
});

test("Reset ends the old address at once", async ({ browser, page }) => {
  const listener = await asUser(browser, "listener@floortest.test");
  const path = new URL(shareUrl).pathname;
  await listener.page.goto(path);
  await listener.page.getByRole("checkbox", { name: "I understand and agree." }).check();
  await listener.page.getByRole("button", { name: "Open the collection" }).click();
  await expect(listener.page.locator("audio").first()).toBeVisible();
  const src = (await listener.page.locator("audio").first().getAttribute("src"))!;

  await logIn(page, "demo@floortest.test");
  await openVillagers(page);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset link" }).click();
  await expect(page.getByRole("textbox", { name: "New share link" })).toBeVisible();

  await listener.page.goto(path);
  await expect(listener.page.getByRole("heading", { name: /This link isn.t available/ })).toBeVisible();
  expect((await listener.page.request.get(src)).status()).toBeGreaterThanOrEqual(400);
  await listener.ctx.close();
});

test("an account on the list finds it under Shared with you, even after a reset, and sign-in brings them back", async ({ browser, page }) => {
  const listener = await asUser(browser, "listener@floortest.test");
  await listener.page.goto("/dashboard/collections");
  await listener.page.getByRole("region", { name: "Shared with you to listen" }).getByRole("link", { name: /Villagers callout/ }).click();
  await listener.page.waitForURL(/\/c\/a\.\d+$/);
  const accountPath = new URL(listener.page.url()).pathname;
  await listener.page.getByRole("checkbox", { name: "I understand and agree." }).check();
  await listener.page.getByRole("button", { name: "Open the collection" }).click();
  const src = (await listener.page.locator("audio").first().getAttribute("src"))!;
  expect((await listener.page.request.get(src)).status()).toBe(200);
  await listener.ctx.close();

  // Signed out, the same address asks for sign-in and comes back after it.
  await page.goto(accountPath);
  await expect(page.getByRole("heading", { name: "Log in to open this collection." })).toBeVisible();
  await page.getByRole("link", { name: "Log in" }).click();
  await page.waitForURL(/\/login/);
  await submitLogin(page, "listener@floortest.test", new RegExp(`${accountPath.replace(/\./g, "\\.")}$`));
  await expect(page.getByRole("button", { name: "Open the collection" })).toBeVisible();

  // Someone else signed in gets nothing from the number.
  const stranger = await asUser(browser, "stranger@floortest.test");
  await stranger.page.goto("/c/a.999999");
  await expect(stranger.page.getByRole("heading", { name: /This link isn.t available/ })).toBeVisible();
  await stranger.ctx.close();
});

test("the owner sees what each person has done and removes one with a confirmation", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await openVillagers(page);
  const lena = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Remove @lena" }) }).first();
  await expect(lena).toContainText(/visits? · 1 played/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove @lena" }).first().click();
  await expect(page.getByText("Removed. Their access has ended.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove @lena" })).toHaveCount(0);
});

test("with sharing on, the legal pages carry the private-sharing wording, and the share page links to Privacy", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByText(/^Private sharing\. If the receiver's collection allows private sharing/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "If someone shares a collection with you" })).toBeVisible();
  await expect(page.getByText(/colleagues who have FloorTest accounts, through a private link that expires after 7 days/)).toHaveCount(0);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Team review" })).toBeVisible();
  await page.goto("/cookies");
  await expect(page.getByText(/^ft_ls_<link>/)).toBeVisible();
  await page.goto(new URL(shareUrl).pathname);
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
});
