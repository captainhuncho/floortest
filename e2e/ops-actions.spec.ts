import { expect, test } from "./fixtures";
import { OPS_INBOX_MESSAGE } from "./ops-account";
import { opsLogIn } from "./ops-login";

/**
 * Ops actions answer in place (ops server design, piece 1, 1 Nov): Inbox → Mark handled says so in the toast and the
 * message leaves the Open list, in the same page (no reload), then Reopen brings it back. Ops sign-in needs a password
 * and a two-step code every time; the seeded ops account's code comes from its test secret (e2e/ops-account.ts).
 */
test("Inbox Mark handled and Reopen answer in place", async ({ page }) => {
  await opsLogIn(page);

  await page.goto("/admin/inbox");
  const message = page.getByRole("listitem").filter({ hasText: OPS_INBOX_MESSAGE });
  await expect(message).toBeVisible();
  // A marker on this document: still there afterwards means the answer came in place, not by reloading the page.
  await page.evaluate(() => ((window as unknown as { opsMark: number }).opsMark = 1));

  await message.getByRole("button", { name: "Mark handled" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked handled" })).toBeVisible();
  await expect(message).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { opsMark?: number }).opsMark)).toBe(1);

  await page.getByRole("link", { name: /^Handled/ }).click();
  const handled = page.getByRole("listitem").filter({ hasText: OPS_INBOX_MESSAGE });
  await handled.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reopened" })).toBeVisible();
  await expect(handled).toHaveCount(0);
});

// Moderation → Keep: records who reviewed the track and kept it, shown on the track and in the results.
test("Moderation Keep marks a track reviewed, in place", async ({ page }) => {
  await opsLogIn(page);
  await page.goto("/admin/moderation?q=Harmattan");
  await page.getByRole("list", { name: "Results" }).getByRole("link", { name: /Harmattan/ }).click();
  // No "Not yet" check first: a rerun (--repeat-each) finds the track already kept, and Keep again is fine.
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Kept "Harmattan": marked reviewed' })).toBeVisible();
  await expect(page.getByText(/Kept by @oluops/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Results" }).getByText("Reviewed", { exact: true })).toBeVisible();
});

// Jobs → Run now: the email queue runs straight away through its scheduled code and records a run; the daily jobs
// (never run in a fresh test copy) offer Run now too.
test("Jobs Run now runs the email queue and records the run", async ({ page }) => {
  await opsLogIn(page);
  await page.goto("/admin/jobs");
  const mail = page.getByRole("listitem").filter({ has: page.getByText("Email queue", { exact: true }) });
  await mail.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Email queue: done" })).toBeVisible({ timeout: 30_000 });
  const daily = page.getByRole("listitem").filter({ has: page.getByText("Daily emails", { exact: true }) });
  await expect(daily.getByRole("button", { name: "Run now" })).toBeVisible();
});

// The shell's live feed (GET /api/admin/feed): signed-in ops get recent activity, private to them; anyone else gets none.
test("the live feed answers ops with recent activity and nobody else", async ({ page, browser }) => {
  const outside = await browser.newContext();
  const signedOut = await outside.request.get("/api/admin/feed", { maxRedirects: 0 });
  expect(signedOut.status()).not.toBe(200);
  await outside.close();

  await opsLogIn(page);
  const res = await page.request.get("/api/admin/feed");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("private, max-age=30");
  const { items } = (await res.json()) as { items: { kind: string; text: string; href: string }[] };
  expect(items.some((i) => i.kind === "signup")).toBe(true);
  expect(items.every((i) => !i.text.startsWith("signed in to ops"))).toBe(true);
});
