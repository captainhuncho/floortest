import { expect, logIn, test } from "./fixtures";

/**
 * The reply box says what really happened (owner, 25 Oct: a limited or repeated reply used to look sent). Uses Tobi on
 * Maxwell's desk, so the per-sender daily limit it reaches doesn't touch the other tests' senders.
 * SHOT_DIR=/some/folder saves a screenshot of each message (for the release check), at the current viewport.
 */
const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: false });
};

test("a reply says whether it went, was already sent, or hit the limit, and a refused one keeps its text", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/contacts");
  await page.getByRole("link", { name: /Tobi/ }).first().click();
  const box = page.getByRole("textbox", { name: /Message to/ });
  const send = page.getByRole("button", { name: "Send email" });
  const status = page.getByRole("status").filter({ hasText: /Reply emailed|Already sent|Not sent|Waiting/ });

  await box.fill("Thanks for this, more soon.");
  await send.click();
  await expect(status).toHaveText(/Reply emailed to Tobi/);
  await expect(box).toHaveValue("");
  await shot(page, "1-sent");

  // The same words again straight away: one email, and the box says so.
  await box.fill("Thanks for this, more soon.");
  await send.click();
  await expect(status).toHaveText(/Already sent: Tobi Adeyemi got this exact reply/);
  await shot(page, "2-repeat");

  // Up to the daily limit for one sender (each try counts), then it's refused and the text stays to try later.
  for (let i = 3; i <= 8; i++) {
    await box.fill(`Note ${i}`);
    await send.click();
    // The box empties only once that send has finished (the message alone could still be the previous one).
    await expect(box).toHaveValue("");
    await expect(status).toHaveText(/Reply emailed to Tobi/);
  }
  await box.fill("One more thing about the mixdown.");
  await send.click();
  await expect(status).toHaveText(/Not sent: that's 8 replies to Tobi Adeyemi today/);
  await expect(box).toHaveValue("One more thing about the mixdown.");
  await shot(page, "3-limit");
  // The same message at phone width (390 px).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(status).toBeVisible();
  await shot(page, "4-limit-phone");
});
