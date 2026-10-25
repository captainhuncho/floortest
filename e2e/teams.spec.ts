import type { Page } from "@playwright/test";
import { currentStep, totpCode } from "../src/lib/totp";
import { expect, logIn, submitLogin, TEST_PASSWORD, test } from "./fixtures";

/**
 * Account teams, end to end (switched on only in the test copy: SEED_TEAMS). The demo account (owner) has 3 seats
 * (Free 1 + 2 add-ons); Lena is on its team as a member. Members switch desks, work the team's desk, can't open the
 * owner's settings, comment for the team (Review Together), and their replies wait for approval when the owner turns that on.
 */
test.describe.configure({ mode: "serial" });

// The owner turns on two-step sign-in in the first test (owners manage their team only with it on), so later tests
// sign the owner in with a code. Two-step refuses a step it has already seen, so a code waits for a fresh step.
let totpSecret = "";
let lastStep = 0;
async function freshCode() {
  while (currentStep() <= lastStep) await new Promise((r) => setTimeout(r, 1000));
  lastStep = currentStep();
  return totpCode(totpSecret, lastStep);
}
async function logInWithTwoStep(page: Page) {
  await page.goto("/login");
  // submitLogin also answers the human check that earlier specs may have triggered for this account.
  await submitLogin(page, "demo@floortest.test", /\/login\/verify/);
  await page.getByLabel("Code").fill(await freshCode());
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/dashboard\//);
}

test("the owner sees the team, turns on reply approval and invites someone", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/settings/team");
  await expect(page.getByRole("heading", { name: "People (2 of 3 seats)" })).toBeVisible();
  await expect(page.getByRole("region", { name: "People (2 of 3 seats)" }).getByText("Lena Listener")).toBeVisible();
  // Owners manage their team only with two-step sign-in on (owner, 15 Oct): the invite form waits until then.
  await expect(page.getByText("Two-step sign-in keeps the whole team safe.")).toBeVisible();
  await expect(page.getByLabel("Email to invite")).toHaveCount(0);
  await page.goto("/dashboard/settings/security");
  await page.getByRole("button", { name: "Set up" }).click();
  totpSecret = (await page.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(await freshCode());
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Save your recovery codes")).toBeVisible();
  await page.goto("/dashboard/settings/team");
  await expect(page.getByText("Two-step sign-in keeps the whole team safe.")).toHaveCount(0);
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
  // Members can't send as the account, so Send isn't offered; nor are the owner's setup checklist or link controls.
  await expect(page.getByRole("link", { name: /^Send$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide this" })).toHaveCount(0);
  await page.goto("/dashboard/review");
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

  // Owner-only and admin-only pages send members to the Team page instead.
  await page.goto("/dashboard/settings/security");
  await expect(page).toHaveURL(/\/dashboard\/settings\/team\?denied=1/);
  await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);
  // Calling the link's cover route directly is refused too (the page that offers it is A&R / Admin only).
  expect((await page.request.delete("/api/cover")).status()).toBe(403);

  // Review Together is part of the team desk: comment on a track for the team.
  await page.goto("/dashboard/review");
  const together = page.getByRole("region", { name: "Review together" }).first();
  await together.getByRole("textbox", { name: "Comment for the team" }).fill("Strong groove, check the mixdown");
  await together.getByRole("button", { name: "Comment" }).click();
  await expect(together.getByText("Strong groove, check the mixdown")).toBeVisible();

  // The team's contacts are here; a reply from a member is held.
  await page.goto("/dashboard/contacts");
  await page.getByRole("link", { name: /Ama/ }).first().click();
  await page.getByRole("textbox", { name: /Message to/ }).fill("Big tune. Can you send the extended mix?");
  await page.getByRole("button", { name: "Send email" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Waiting for approval/ })).toBeVisible();
  await page.goto("/dashboard/settings/team");
  await expect(page.getByRole("heading", { name: "Your replies waiting for approval" })).toBeVisible();
  await expect(page.getByText("Big tune. Can you send the extended mix?")).toBeVisible();

  // The desk's log shows what was done on it, but never the owner's own sign-ins or security settings.
  await page.goto("/dashboard/activity");
  await expect(page.getByText("The account holder's sign-ins and settings aren't shown.")).toBeVisible();
  await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);
});

test("the owner approves the held reply from the Team page", async ({ page }) => {
  await logInWithTwoStep(page);
  // The Floor's "Your desk" line says what needs the owner (the reply waiting) and how many seats are in use.
  await page.goto("/dashboard/floor");
  const desk = page.getByRole("region", { name: "Your desk" });
  await expect(desk.getByRole("link", { name: "1 reply waiting for your approval" })).toBeVisible();
  await expect(desk.getByRole("link", { name: /of \d+ seats/ })).toBeVisible();
  await desk.getByRole("link", { name: "1 reply waiting for your approval" }).click();
  await page.waitForURL(/\/dashboard\/settings\/team/);
  await expect(page.getByRole("heading", { name: "Waiting for approval (1)" })).toBeVisible();
  await expect(page.getByText(/Lena Listener → /)).toBeVisible();
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for approval (0)" })).toBeVisible();
  // The member's comment is on the owner's desk, signed by them.
  await page.goto("/dashboard/review");
  await expect(page.getByRole("region", { name: "Review together" }).first().getByText("Lena Listener")).toBeVisible();
  // The account log names who did each thing: the held reply was the member's.
  await page.goto("/dashboard/activity");
  await expect(page.getByText("by Lena Listener").first()).toBeVisible();
});
