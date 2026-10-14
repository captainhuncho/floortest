import type { Page } from "@playwright/test";
import { expect, logIn, test } from "./fixtures";

/**
 * One-by-one review on the seeded receiver's desk: a decision moves on at once and the save runs alongside, so a
 * failed save has to bring the track back; and deciding the last waiting track lands on "All caught up.".
 */
test.describe.configure({ mode: "serial" });

const panelOf = (page: Page) => page.getByRole("complementary", { name: "Review" });
const titleIn = (page: Page) => panelOf(page).locator("h2[data-track-title]").locator("visible=true").first();
/** Server actions are POSTs to the page with a Next-Action header. */
const isAction = (method: string, headers: Record<string, string>) => method === "POST" && !!headers["next-action"];

test("a decision that fails to save brings the track back with the error toast", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review?view=queue");
  await expect(titleIn(page)).toBeVisible();
  const before = (await titleIn(page).textContent())!.trim();

  await page.route(
    (url) => url.pathname === "/dashboard/review",
    (route) => (isAction(route.request().method(), route.request().headers()) ? route.fulfill({ status: 500, body: "Server down" }) : route.continue()),
  );
  await panelOf(page).getByRole("button", { name: /^Keep/ }).click();
  await expect(page.getByText("Couldn't save that. Nothing changed. Try again.")).toBeVisible();
  await expect(titleIn(page)).toHaveText(before);
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // Nothing was saved: after a reload it's still the first track waiting.
  await page.goto("/dashboard/review?view=queue");
  await expect(titleIn(page)).toHaveText(before);
});

test("deciding the last waiting track in a filtered view lands on All caught up.", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  // Set up a collection with exactly one waiting track: move Night Market into Afterlife (nothing waits there).
  await page.goto("/dashboard/review?view=queue&q=Night%20Market");
  await expect(titleIn(page)).toHaveText("Night Market");
  const details = panelOf(page).locator("details").filter({ hasText: "file, dates, move" });
  await details.locator("summary").click();
  await details.getByRole("combobox", { name: "Collection" }).selectOption({ label: "Afterlife callout" });
  await Promise.all([
    page.waitForResponse((r) => isAction(r.request().method(), r.request().headers()) && r.ok()),
    details.getByRole("button", { name: "Move", exact: true }).click(),
  ]);

  // Filter the Queue to Afterlife: Night Market is the one track waiting there.
  await page.goto("/dashboard/review?view=queue");
  await page.getByRole("button", { name: "Collection" }).click();
  await page.getByRole("menuitemradio", { name: /^Afterlife callout/ }).click();
  await page.waitForURL(/[?&]c=\d+/);
  await expect(titleIn(page)).toHaveText("Night Market");

  await panelOf(page).getByRole("button", { name: /^Keep/ }).click();
  const heading = page.getByRole("heading", { name: "All caught up." });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole("link", { name: "Open Prepare" })).toBeVisible();
  await expect(page.getByText(/^\d+ kept ready for your set\.$/)).toBeVisible();
});
