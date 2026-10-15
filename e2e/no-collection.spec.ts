import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, logIn, submitLogin, test, wav } from "./fixtures";

/**
 * A new desk starts with no collection (owner, 15 Oct): its link is open anyway, and what's sent lands straight in the
 * Review Queue, unsorted. The Floor says so instead of calling it a problem; the first collection is the receiver's to make.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const desk = { handle: `nc${stamp}`, email: `nc+${stamp}@example.test`, password: "Correct-Horse-Battery-77" };
const title = `No Collection ${stamp}`;

test("a new desk has no collection, and its link is open", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill("E2E-INVITE");
  await page.getByLabel("What best describes you?").selectOption("dj");
  await page.getByLabel("First name").fill("Nia");
  await page.getByLabel("Surname").fill("Fresh");
  await page.getByLabel("Username").fill(desk.handle);
  await page.getByLabel("Email").fill(desk.email);
  await page.getByRole("textbox", { name: "Password" }).fill(desk.password);
  await page.getByRole("checkbox", { name: /18 or over/ }).check();
  await page.getByRole("button", { name: "Create my link" }).click();
  await page.waitForURL(/\/dashboard\/floor/);
  // No warning banner: nothing is wrong with a desk that hasn't made a collection yet.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Sends tracks to your Review Queue")).toBeVisible();
  await page.goto("/dashboard/collections");
  await expect(page.getByRole("button", { name: "New collection" })).toBeVisible();
  await expect(page.getByText("RECEIVING", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/sends tracks straight to your Review Queue/)).toBeVisible();
});

test("a track sent to it lands in the Review Queue, unsorted", async ({ page }) => {
  const file = path.join(os.tmpdir(), `${title}.wav`);
  fs.writeFileSync(file, wav());
  await logIn(page, "sender@floortest.test");
  await page.goto(`/dashboard/send?to=${desk.handle}`);
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles(file);
  // Wait until the file is read (length and BPM shown), so typing isn't undone when its details fill in.
  await expect(page.getByText(/WAV · \d+ KB · \d+:\d+/)).toBeVisible();
  await page.getByLabel("Track title").fill(title);
  await page.getByLabel("Artist").fill("E2E Artist");
  // No collection means no brief: the full genre list, as a menu.
  await page.getByRole("combobox", { name: "Genre" }).selectOption("Afro House");
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
  await page.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByText(/We sent a receipt to/)).toBeVisible({ timeout: 80_000 });

  await page.context().clearCookies();
  await page.goto("/login");
  await submitLogin(page, desk.email, /\/dashboard\//, desk.password);
  await page.goto("/dashboard/review?view=list");
  await expect(page.getByText(title).locator("visible=true").first()).toBeVisible();
});
