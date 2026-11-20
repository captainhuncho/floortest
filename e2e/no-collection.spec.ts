import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, logIn, submitLogin, test, wav, signUp } from "./fixtures";

/**
 * A new desk starts with no collection (owner, 15 Oct): its link is open anyway, and what's sent lands straight in the
 * Review Queue, unsorted. The Floor says so instead of calling it a problem; the first collection is the receiver's to make.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const desk = { handle: `nc${stamp}`, email: `nc+${stamp}@example.test`, password: "Correct-Horse-Battery-77" };
const title = `No Collection ${stamp}`;

test("a new desk has no collection, and its link is open", async ({ page }) => {
  await signUp(page, { kind: "DJ", first: "Nia", last: "Fresh", handle: desk.handle, email: desk.email, password: desk.password });
  // No warning banner: nothing is wrong with a desk that hasn't made a collection yet.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Sends tracks to your Review Queue")).toBeVisible();
  await page.goto("/dashboard/collections");
  // The first callout is made from + Add (owner, 20 Nov, option 66: Callout or Folder on the Callouts tab).
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Add to Callouts" }).getByRole("menuitem", { name: /^Callout/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Add to Callouts" })).toHaveCount(0);
  await expect(page.getByText("Receiving", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/sends tracks straight to your Review Queue/)).toBeVisible();
  // A link takes tracks only once its owner has confirmed their email (sign-up guard, #535): confirm it from the email.
  const MAIL = `http://127.0.0.1:${Number(process.env.E2E_MAIL_PORT || 3212)}/mail`;
  let link = "";
  await expect
    .poll(async () => {
      const box = (await (await page.request.get(`${MAIL}?to=${encodeURIComponent(desk.email)}`)).json()) as { body: string }[];
      link = box.map((m) => m.body.match(/\/verify-email\/[A-Za-z0-9_-]+/)?.[0] ?? "").filter(Boolean).at(-1) ?? "";
      return link;
    })
    .toMatch(/^\/verify-email\//);
  await page.goto(link);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
});

test("a track sent to it lands in the Review Queue, unsorted", async ({ page }) => {
  const file = path.join(os.tmpdir(), `${title}.wav`);
  fs.writeFileSync(file, wav());
  await logIn(page, "sender@floortest.test");
  await page.goto(`/dashboard/send?to=${desk.handle}`);
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles(file);
  // Wait until the file is read (length and BPM shown), so typing isn't undone when its details fill in.
  await expect(page.getByText(/WAV · \d+:\d+/)).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByLabel("Artist").fill("E2E Artist");
  // No collection means no brief: the full genre list, as a menu.
  await page.getByRole("combobox", { name: "Genre" }).selectOption("Afro House");
  await page.getByRole("group", { name: /^Mix/ }).getByRole("button", { name: "Mixed, not mastered" }).click();
  await page.getByRole("group", { name: /^Release/ }).getByRole("button", { name: "Unreleased" }).click();
  await page.getByRole("group", { name: /^AI use/ }).getByRole("button", { name: "None", exact: true }).click();
  // The file's own details arrive late on a cold dev server; they must not wipe what was typed (fillFromFile, 31 Oct).
  await expect(page.getByLabel("Artist")).toHaveValue("E2E Artist");
  await page.getByRole("button", { name: /^Send to / }).click();
  // The receipt shows only once the track is saved on the desk (a held upload says "is received" instead).
  await expect(page.getByText(/Your receipt is on its way to/)).toBeVisible({ timeout: 80_000 });

  await page.context().clearCookies();
  await page.goto("/login");
  await submitLogin(page, desk.email, /\/dashboard\//, desk.password);
  await page.goto("/dashboard/review?view=list");
  await expect(page.getByText(title).locator("visible=true").first()).toBeVisible();
  // Getting started ticks the first track off from real data; a collection was never one of its steps.
  await page.goto("/dashboard/floor");
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /Get your first track\s*\(done\)/ })).toBeVisible();
  await expect(page.getByText(/collection for your callout/)).toHaveCount(0);
});
