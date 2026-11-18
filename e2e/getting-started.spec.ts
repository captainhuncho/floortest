import { expect, signUp, test } from "./fixtures";

/**
 * Getting started on the Floor (Desk, 13 Nov): a new account owner sees five steps that tick off from what they really
 * do. Copying the link ticks "Share your link"; Hide this puts the card away for good.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const desk = { handle: `gs${stamp}`, email: `gs+${stamp}@example.test`, password: "Correct-Horse-Battery-77" };
const card = (page: import("@playwright/test").Page) => page.locator("section", { has: page.getByRole("heading", { name: "Getting started" }) });

async function render(page: import("@playwright/test").Page, name: string) {
  for (const [size, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]] as const) {
    await page.setViewportSize(viewport);
    await card(page).scrollIntoViewIfNeeded();
    await card(page).screenshot({ path: test.info().outputPath(`getting-started-${name}-${size}.png`) });
  }
}

test("a new owner sees five steps, copying the link ticks one off, and Hide this puts the card away", async ({ page }) => {
  await signUp(page, { kind: "DJ", first: "Gia", last: "Start", handle: desk.handle, email: desk.email, password: desk.password });
  await page.goto("/dashboard/floor");
  const c = card(page);
  await expect(c).toBeVisible();
  await expect(c.getByText("0 of 5")).toBeVisible();
  await expect(c.getByRole("progressbar", { name: "Getting started" })).toHaveAttribute("aria-valuenow", "0");
  // Each open step is a row that goes where it's done (option 41's new desk; sharing happens from the link row).
  await expect(c.getByRole("link", { name: /Add a photo and a line about you/ })).toHaveAttribute("href", "/dashboard/settings/profile");
  await expect(c.getByRole("link", { name: /Get your first track/ })).toHaveAttribute("href", `/${desk.handle}`);
  await render(page, "new");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /^Copy your link, / }).first().click();
  await expect(page.getByText("Your link is copied.")).toBeVisible();
  await expect.poll(async () => {
    await page.reload();
    return card(page).getByText("1 of 5").count();
  }, { timeout: 15_000 }).toBe(1);
  await expect(c.getByRole("listitem").filter({ hasText: /Share your link\s*\(done\)/ })).toBeVisible();
  await render(page, "half");

  await c.getByRole("button", { name: "Hide this" }).click();
  await expect(page.getByRole("heading", { name: "Getting started" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Getting started" })).toHaveCount(0);
});

// Settings (option 47) has no link card, so the Floor's Copy is the one place a new owner copies the link.
test("copying the link on the Floor ticks Share your link, for a second new owner", async ({ page }) => {
  const s = `${stamp}b`;
  await signUp(page, { kind: "DJ", first: "Gia", last: "Copy", handle: `gs${s}`, email: `gs+${s}@example.test`, password: desk.password });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dashboard/floor");
  await expect(card(page).getByText("0 of 5")).toBeVisible();
  await page.getByRole("button", { name: /^Copy your link, / }).first().click();
  await expect(page.getByText("Your link is copied.")).toBeVisible();
  await expect.poll(async () => {
    await page.reload();
    return card(page).getByRole("listitem").filter({ hasText: /Share your link\s*\(done\)/ }).count();
  }, { timeout: 15_000 }).toBe(1);
  await expect(card(page).getByText("1 of 5")).toBeVisible();
  // The old Account address, where this step used to be, now lands on Settings.
  await page.goto("/dashboard/account");
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
});
