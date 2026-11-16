import { expect, logIn, test, wav } from "./fixtures";

/**
 * Send rules by receiver type (Research brief, owner 15 Nov): a sender to a label desk picks Evaluation only (the
 * default) or OK to play, and the label's desk shows which. An evaluation-only track is held back from the played-out
 * pick page by name. Luna Label and Lou Sender are e2e-only seed accounts (scripts/seed.ts, SEED_SHARING).
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
// Unique per repeat too (--repeat-each), so each run's tracks are its own.
const EVAL = () => `Label Eval ${stamp}-${test.info().repeatEachIndex}`;
const OK = () => `Label Play ${stamp}-${test.info().repeatEachIndex}`;

async function send(page: import("@playwright/test").Page, title: string, play: "Evaluation only" | "OK to play") {
  await page.goto("/dashboard/send?to=lunalabel");
  await page.getByLabel("Choose WAV or MP3 files").setInputFiles({ name: `${title}.wav`, mimeType: "audio/wav", buffer: wav(4) });
  await expect(page.getByText(/WAV · \d+ KB · \d+:\d+/)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Track title").fill(title);
  await page.getByLabel("Artist").fill("Lou Sender");
  const genre = page.getByRole("combobox", { name: "Genre" });
  if (await genre.count()) await genre.selectOption({ index: 1 });
  else await page.getByRole("group", { name: /^Genre/ }).getByRole("radio").first().check({ force: true });
  await page.getByRole("group", { name: /^Mix status/ }).getByText("Mixed, not mastered").click();
  await page.getByRole("group", { name: /^Release status/ }).getByText("Unreleased").click();
  await page.getByRole("group", { name: /^Made with AI/ }).getByText("No", { exact: true }).click();
  const choice = page.getByRole("group", { name: /^Sending to a label/ });
  // Evaluation only is the default; the sender has to choose OK to play.
  await expect(choice.getByRole("radio", { name: "Evaluation only" })).toBeChecked();
  if (play === "OK to play") await choice.getByText("OK to play").click();
  await expect(choice.getByRole("radio", { name: play })).toBeChecked();
  await page.getByRole("button", { name: /^Send to / }).click();
  await expect(page.getByText(/We sent a receipt to/)).toBeVisible({ timeout: 180_000 });
}

test("a signed-in sender picks Evaluation only or OK to play when sending to a label", async ({ page }) => {
  test.slow();
  await logIn(page, "label-sender@floortest.test");
  await send(page, EVAL(), "Evaluation only");
  await send(page, OK(), "OK to play");
});

test("the label's desk shows each choice, and the pick page holds back the evaluation-only track", async ({ page }) => {
  test.slow();
  await logIn(page, "label@floortest.test");
  for (const [title, chip] of [[EVAL(), "Evaluation only: ask before playing it out"], [OK(), "OK to play"]] as const) {
    // The queue view's review card shows the choice; searching by title opens that track's card.
    // Under a full run the list can trail the tab counts by a moment, so the search is loaded again until the card shows.
    await expect(async () => {
      await page.goto(`/dashboard/review?view=queue&q=${encodeURIComponent(title)}`);
      await expect(page.getByRole("complementary", { name: "Review" }).getByText(title).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByText(chip, { exact: true }).locator("visible=true").first()).toBeVisible();
    // Keep it and let the save finish (the card clears at once, before the save lands), then find it under Kept.
    // A click that lands before the page is ready does nothing, so the whole step is tried again.
    const card = page.getByRole("complementary", { name: "Review" });
    await expect(async () => {
      await page.goto(`/dashboard/review?view=queue&q=${encodeURIComponent(title)}`);
      const keep = card.getByRole("button", { name: /^Keep/ });
      if (await keep.isVisible()) {
        const saved = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 10_000 });
        await keep.click();
        await saved;
      }
      await page.goto(`/dashboard/review?view=queue&s=kept&q=${encodeURIComponent(title)}`);
      await expect(card.getByText(title).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
  }
  await page.goto("/dashboard/played-out");
  await expect(page.getByText(new RegExp(`Not listed: .*${EVAL()}`))).toBeVisible();
  await expect(page.getByText(OK()).locator("visible=true").first()).toBeVisible();
});
