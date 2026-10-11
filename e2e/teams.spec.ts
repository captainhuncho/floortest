import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Account teams, end to end (switched on only in the test copy: SEED_TEAMS). The demo account (owner) has 3 seats
 * (Free 1 + 2 add-ons); Lena is on its team as a member. Members switch desks, work the team's desk, can't open the
 * owner's settings, and their replies wait for approval when the owner turns that on.
 */
test.describe.configure({ mode: "serial" });

const PW = "floortest-demo";

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PW);
  await page.getByRole("button", { name: "Log in" }).click();
  const dashboard = page.waitForURL(/\/dashboard\//, { timeout: 60_000 }).then(() => "in" as const);
  const check = page.getByTestId("turnstile").waitFor({ state: "attached", timeout: 60_000 }).then(() => "check" as const, () => "none" as const);
  if ((await Promise.race([dashboard, check])) === "check" && !(await page.waitForURL(/\/dashboard\//, { timeout: 5_000 }).then(() => true, () => false))) {
    await page.getByRole("textbox", { name: "Password" }).fill(PW);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/dashboard\//);
  }
  await dashboard.catch(() => {});
}

test("the owner sees the team, turns on reply approval and invites someone", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/settings/team");
  await expect(page.getByRole("heading", { name: "People (2 of 3 seats)" })).toBeVisible();
  await expect(page.getByRole("region", { name: "People (2 of 3 seats)" }).getByText("Lena Listener")).toBeVisible();
  await page.getByRole("checkbox", { name: /need approval before they.re sent/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByLabel("Email to invite").fill("newperson@example.test");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("Invite sent to newperson@example.test.")).toBeVisible();
  await expect(page.getByText(/newperson@example.test · invited as member/)).toBeVisible();
});

test("a member switches to the team's desk, can't open owner settings, and their reply waits for approval", async ({ page }) => {
  await logIn(page, "listener@floortest.test");
  await expect(page.getByText("Your own desk")).toBeVisible();
  await page.getByText("Switch desk").click();
  await page.getByRole("button", { name: /Maxwell Adjavon/ }).click();
  await expect(page.getByText(/On Maxwell Adjavon.s desk as a member/)).toBeVisible();

  // Owner-only and admin-only pages send members to the Team page instead.
  await page.goto("/dashboard/settings/security");
  await expect(page).toHaveURL(/\/dashboard\/settings\/team\?denied=1/);
  await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);

  // The team's contacts are here; a reply from a member is held.
  await page.goto("/dashboard/contacts");
  await page.getByRole("link", { name: /Ama/ }).first().click();
  await page.getByRole("textbox", { name: /Message to/ }).fill("Big tune. Can you send the extended mix?");
  await page.getByRole("button", { name: "Send email" }).click();
  await page.goto("/dashboard/settings/team");
  await expect(page.getByRole("heading", { name: "Your replies waiting for approval" })).toBeVisible();
  await expect(page.getByText("Big tune. Can you send the extended mix?")).toBeVisible();
});

test("the owner approves the held reply from the Team page", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/settings/team");
  await expect(page.getByRole("heading", { name: "Waiting for approval (1)" })).toBeVisible();
  await expect(page.getByText(/Lena Listener → /)).toBeVisible();
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for approval (0)" })).toBeVisible();
});
