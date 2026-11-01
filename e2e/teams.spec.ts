import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { currentStep, totpCode } from "../src/lib/totp";
import { expect, hydrated, logIn, submitLogin, TEST_PASSWORD, test } from "./fixtures";

/**
 * Account teams, end to end (switched on only in the test copy: SEED_TEAMS). Its own owner, Tia (teams@), has 3 seats
 * (Free 1 + 2 add-ons), a callout with tracks waiting, and Lena on her team as a member; the spec turns two-step sign-in
 * on for Tia, so it never changes the demo account other specs use (1 Nov). Members switch desks, work the team's desk, can't open the
 * owner's settings, comment for the team (Review Together), and their replies wait for approval when the owner turns that on.
 */
test.describe.configure({ mode: "serial" });

// The owner turns on two-step sign-in in the first test (owners manage their team only with it on), so later tests
// sign the owner in with a code. Two-step refuses a step it has already seen, so a code waits for a fresh step.
// The secret is kept in the throwaway test copy's folder too (fresh each run), so a rerun of the first test in the same
// run (--repeat-each, or after a failure restarts the worker) signs in with the code instead of waiting for the desk.
const SECRET_FILE = path.join(".e2e", "teams-totp-secret");
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
  await submitLogin(page, "teams@floortest.test", /\/login\/verify/);
  await enterCode(page);
}
async function enterCode(page: Page) {
  await page.getByLabel("Code").fill(await freshCode());
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/dashboard\//);
}

test("the owner sees the team, turns on reply approval and invites someone", async ({ page }) => {
  // A rerun in the same run finds two-step already on from the first go: sign in with the code it saved.
  await page.goto("/login");
  await submitLogin(page, "teams@floortest.test", /\/dashboard\/|\/login\/verify/);
  const rerun = /\/login\/verify/.test(page.url());
  if (rerun) {
    totpSecret ||= fs.readFileSync(SECRET_FILE, "utf8");
    // A restarted worker forgets the last step used: wait for a new one, since the first go's last code is spent.
    lastStep = Math.max(lastStep, currentStep());
    await enterCode(page);
  }
  await page.goto("/dashboard/settings/team");
  if (rerun) {
    // The first go's invite holds the last seat and makes the People list long enough to fold (settings folds, 31 Oct):
    // open the fold once React owns its button (a click before that does nothing), cancel the invite, and reload so
    // the run starts as seeded, with two people and the list open again.
    const people = page.getByRole("button", { name: /^People ·/ });
    if ((await people.getAttribute("aria-expanded")) === "false") {
      await hydrated(people);
      await people.click();
      await expect(people).toHaveAttribute("aria-expanded", "true");
    }
    const leftover = page.getByRole("button", { name: "Cancel invite" });
    if (await leftover.count()) {
      await hydrated(leftover.first());
      await leftover.first().click();
      await expect(leftover).toHaveCount(0);
    }
    await page.reload();
  }
  await expect(page.getByRole("heading", { name: "People (2 of 3 seats)" })).toBeVisible();
  await expect(page.getByRole("region", { name: "People (2 of 3 seats)" }).getByText("Lena Listener", { exact: true })).toBeVisible();
  if (!rerun) {
    // Owners manage their team only with two-step sign-in on (owner, 15 Oct): the invite form waits until then.
    // .first(): while the page refreshes, the notice can briefly exist twice (old and new page), and an exact match
    // would fail at once on two (seen 1 Nov after main's settings changes). The count check below still means "gone".
    await expect(page.getByText("Two-step sign-in keeps the whole team safe.").first()).toBeVisible();
    await expect(page.getByLabel("Email to invite")).toHaveCount(0);
    await page.goto("/dashboard/settings/security");
    // Under load "Set up" showed before React owned it and the click did nothing (1 Nov): wait for React first.
    const setUp = page.getByRole("button", { name: "Set up" });
    await hydrated(setUp);
    await setUp.click();
    totpSecret = (await page.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
    fs.writeFileSync(SECRET_FILE, totpSecret);
    await page.getByLabel("6-digit code").fill(await freshCode());
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByText("Save your recovery codes")).toBeVisible();
    await page.goto("/dashboard/settings/team");
  }
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
  await page.getByRole("button", { name: /Tia Teams/ }).click();
  await expect(page.getByText(/On Tia Teams.s desk as a member/)).toBeVisible();
  // Members can't send as the account, so Send isn't offered; nor are the owner's setup checklist or link controls.
  await expect(page.getByRole("link", { name: /^Send$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide this" })).toHaveCount(0);
  await page.goto("/dashboard/review");
  // Members can't delete tracks. (Deleting their own Review Together comment, left by an earlier go, is theirs to do.)
  const trackDelete = page.getByRole("button", { name: "Delete", exact: true }).and(page.locator(':not([aria-label="Review together"] *)'));
  await expect(trackDelete).toHaveCount(0);

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
  await expect(together.getByText("Strong groove, check the mixdown").first()).toBeVisible();

  // The team's contacts are here; a reply from a member is held. Each go sends its own words: the same reply to the same
  // person within 10 minutes is refused as already sent.
  const reply = `Big tune. Can you send the extended mix? (${Date.now().toString(36)})`;
  await page.goto("/dashboard/contacts");
  await page.getByRole("link", { name: /Femi/ }).first().click();
  await page.getByRole("textbox", { name: /Message to/ }).fill(reply);
  await page.getByRole("button", { name: "Send email" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Waiting for approval/ })).toBeVisible();
  await page.goto("/dashboard/settings/team");
  await expect(page.getByRole("heading", { name: "Your replies waiting for approval" })).toBeVisible();
  // .first(): during the page's refresh the reply can briefly show twice (old and new page), as the two-step notice did.
  await expect(page.getByText(reply).first()).toBeVisible();

  // The desk's log shows what was done on it, but never the owner's own sign-ins or security settings.
  await page.goto("/dashboard/activity");
  await expect(page.getByText("The account holder's sign-ins and settings aren't shown.").first()).toBeVisible();
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
  await expect(page.getByText(/Lena Listener → /).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for approval (0)" })).toBeVisible();
  // The member's comment is on the owner's desk, signed by them.
  await page.goto("/dashboard/review");
  await expect(page.getByRole("region", { name: "Review together" }).first().getByText("Lena Listener").first()).toBeVisible();
  // The account log names who did each thing: the held reply was the member's.
  await page.goto("/dashboard/activity");
  await expect(page.getByText("by Lena Listener").first()).toBeVisible();
});
