import { expect, test } from "./fixtures";

/**
 * Email links that act (link-page audit, 2 Nov): opening the page only asks; the button (a POST) does it. A mail scanner
 * that opens every link therefore can't arm a reopen alert or confirm a newsletter sign-up. A made-up token shows the
 * question first, then "didn't work" only after the press: the GET itself never checked or used it.
 */
for (const [path, button] of [
  ["/sent/reopen/not-a-real-token", "Confirm the alert"],
  ["/newsletter/confirm/not-a-real-token", "Subscribe"],
] as const) {
  test(`${path.split("/").slice(1, 3).join(" ")}: opening the link only asks; pressing the button acts`, async ({ page }) => {
    await page.goto(path);
    const press = page.getByRole("button", { name: button });
    await expect(press).toBeVisible();
    await expect(page.getByText("That link didn't work")).toHaveCount(0);
    await press.click();
    await expect(page.getByRole("heading", { name: "That link didn't work" })).toBeVisible();
  });
}
