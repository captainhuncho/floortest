import { expect, hydrated, logIn, test } from "./fixtures";

/**
 * The reply box says what really happened (owner, 25 Oct: a limited or repeated reply used to look sent). Uses Tobi on
 * Maxwell's desk (Nightshift Records on a repeat), so the per-sender daily limit it reaches doesn't touch the other
 * tests' senders.
 * SHOT_DIR=/some/folder saves a screenshot of each message (for the release check), at the current viewport.
 */
// Each repeat (--repeat-each) replies to its own seeded sender, because the limit is 8 a day per sender: Tobi, then
// Nightshift Records (the two senders on Maxwell's desk no other spec uses). Its words carry a run mark, so the 10-minute
// "Already sent" check never meets an earlier run's reply (2 Nov: repeats failed at the first send).
const SENDERS = [
  { link: /Tobi/, name: "Tobi Adeyemi", short: "Tobi" },
  { link: /Nightshift/, name: "Nightshift Records", short: "Nightshift" },
] as const;

const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: false });
};

test("a reply says whether it went, was already sent, or hit the limit, and a refused one keeps its text", async ({ page }) => {
  const run = test.info().repeatEachIndex;
  test.skip(run >= SENDERS.length, "two free senders, each with 8 replies a day: a third repeat would start at the limit");
  const who = SENDERS[run];
  const mark = Date.now().toString(36);
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/contacts");
  await page.getByRole("link", { name: who.link }).first().click();
  const box = page.getByRole("textbox", { name: /Message to/ });
  const send = page.getByRole("button", { name: "Send email" });
  const status = page.getByRole("status").filter({ hasText: /Reply emailed|Already sent|Not sent|Waiting/ });
  // React has to own the button before the first press (in a full run the press could come first and nothing answered).
  await hydrated(send);

  const first = `Thanks for this, more soon. (${mark})`;
  await box.fill(first);
  await send.click();
  // The first reply is the first call of this action: the dev server compiles it then, which took over 15 s on a busy
  // machine (2 Nov), so this one answer gets a minute.
  await expect(status).toHaveText(new RegExp(`Reply emailed to ${who.short}`), { timeout: 60_000 });
  await expect(box).toHaveValue("");
  await shot(page, "1-sent");

  // The same words again straight away: one email, and the box says so.
  await box.fill(first);
  await send.click();
  await expect(status).toHaveText(new RegExp(`Already sent: ${who.name} got this exact reply`));
  await shot(page, "2-repeat");

  // Up to the daily limit for one sender (each try counts), then it's refused and the text stays to try later.
  for (let i = 3; i <= 8; i++) {
    await box.fill(`Note ${i} (${mark})`);
    await send.click();
    // The box empties only once that send has finished (the message alone could still be the previous one).
    await expect(box).toHaveValue("");
    await expect(status).toHaveText(new RegExp(`Reply emailed to ${who.short}`));
  }
  await box.fill("One more thing about the mixdown.");
  await send.click();
  await expect(status).toHaveText(new RegExp(`Not sent: that's 8 replies to ${who.name} today`));
  await expect(box).toHaveValue("One more thing about the mixdown.");
  await shot(page, "3-limit");
  // The same message at phone width (390 px).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(status).toBeVisible();
  await shot(page, "4-limit-phone");
});
