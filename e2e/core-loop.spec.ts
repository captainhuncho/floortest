import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, wav } from "./fixtures";

/**
 * The money path, in a real browser: a sender signs up with an invite (and can't send until the email is confirmed);
 * a confirmed sender sends a WAV to the demo receiver's link;
 * the receiver finds it in the Review Queue, keeps it, and downloads it from Prepare for set as a named folder.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const sender = { first: "Eddie", last: "Tester", handle: `e2e${stamp}`, email: `e2e+${stamp}@example.test`, password: "Correct-Horse-Battery-77" };
const title = `E2E Track ${stamp}`;

function wavFile() {
  const file = path.join(os.tmpdir(), `${title}.wav`);
  fs.writeFileSync(file, wav());
  return file;
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
}

test("a new sender signs up with an invite code", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill("E2E-INVITE");
  await page.getByLabel("What best describes you?").selectOption("producer");
  await page.getByLabel("First name").fill(sender.first);
  await page.getByLabel("Surname").fill(sender.last);
  await page.getByLabel("Username").fill(sender.handle);
  await page.getByLabel("Email").fill(sender.email);
  await page.getByRole("textbox", { name: "Password" }).fill(sender.password);
  await page.getByRole("checkbox", { name: /18 or over/ }).check();
  await page.getByRole("button", { name: "Create my link" }).click();
  await page.waitForURL(/\/dashboard\/floor/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(sender.first);
  // Until the email is confirmed, a send from the account is refused before any upload.
  const refused = await page.request.post("/api/submit/maxwell", { data: { asAccount: true, title: "x", artist: "x", genre: "House", fileName: "x.wav", size: 1000, release_status: "unsigned", mix_status: "mastered", ai_use: "none" } });
  expect(refused.status()).toBe(403);
});

test("the sender sends a WAV to the receiver's link", async ({ page }) => {
  await logIn(page, "sender@floortest.test", "floortest-demo");
  await page.goto("/dashboard/send?to=maxwell");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles(wavFile());
  await page.getByLabel("Track title").fill(title);
  await page.getByLabel("Artist").fill("E2E Artist");
  // Genre, mix, release and AI are tap choices: the visible label is what a sender taps.
  await page.getByRole("group", { name: /^Genre/ }).locator("label").first().click();
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
  await page.getByRole("button", { name: /^Send to / }).click();
  // Generous: on a cold dev build the first upload compiles the whole send path.
  await expect(page.getByText(/We sent a receipt to/)).toBeVisible({ timeout: 80_000 });
  await expect(page.getByRole("heading", { name: /^Sent \(\d+\)$/ })).toBeVisible();
});

test("the receiver keeps it and downloads it from Prepare for set", async ({ page }) => {
  await logIn(page, "demo@floortest.test", "floortest-demo");
  await page.goto("/dashboard/review?view=list");
  const row = page.getByText(title).locator("visible=true").first();
  await expect(row).toBeVisible();
  await row.click();
  await page.getByRole("button", { name: /^Keep/ }).locator("visible=true").first().click();
  await page.goto("/dashboard/prepare");
  await expect(page.getByText(title).locator("visible=true").first()).toBeVisible();
  await page.getByRole("button", { name: "Download kept" }).click();
  await page.getByLabel("Name the new folder").fill("E2E Set");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("E2E Set.zip");
  const zip = await download.path();
  expect(fs.statSync(zip).size).toBeGreaterThan(200_000); // the WAV went in whole
});
