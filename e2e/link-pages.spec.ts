import type { APIRequestContext, Page } from "@playwright/test";
import { expect, hydrated, logIn, test } from "./fixtures";
import { LINKS } from "./link-pages-data";

/**
 * Private link pages (owner, 2 Nov): someone holding only the link (a forwarded email, a screenshot, a mail scanner, a
 * chat preview) sees the address it was sent to masked, as m•••@g•••.com, in the page and in the data React loads
 * with it. Only the account the address belongs to, signed in, sees it in full. Each page also tells browsers and
 * caches not to keep it and other sites not to learn its address, without breaking its own buttons (server actions).
 * Data: scripts/seed.ts (SEED_LINK_PAGES), e2e/link-pages-data.ts.
 */
const PAGES = [
  { path: `/receipt/${LINKS.receiptToken}`, email: LINKS.sender.email, masked: LINKS.sender.masked },
  { path: `/sent/${LINKS.sentToken}`, email: LINKS.sender.email, masked: LINKS.sender.masked },
  { path: `/join/${LINKS.inviteSecret}`, email: LINKS.invitee.email, masked: LINKS.invitee.masked },
  { path: `/verify-email/${LINKS.verifyToken}`, email: LINKS.unverified.email, masked: LINKS.unverified.masked },
  { path: `/confirm-email/${LINKS.confirmToken}`, email: LINKS.changer.email, masked: LINKS.changer.masked },
];

/** The page as HTML, and as the RSC flight data a client-side navigation loads (the #329 lesson: props leak there). */
async function fetchBoth(request: APIRequestContext, path: string) {
  const html = await request.get(path);
  const rsc = await request.get(path, { headers: { RSC: "1" } });
  expect(html.status(), path).toBe(200);
  expect(rsc.status(), path).toBe(200);
  expect(rsc.headers()["content-type"], path).toContain("text/x-component");
  return { html: await html.text(), rsc: await rsc.text(), headers: html.headers(), rscHeaders: rsc.headers() };
}

function expectPrivateHeaders(h: Record<string, string>, path: string) {
  // A production build sends the proxy's "private, no-store" (checked with next start, 2 Nov; the exact value is
  // tests/search-index.test.ts). Under next dev, which this runs on, Next writes "no-store" over it.
  expect(h["cache-control"], path).toContain("no-store");
  expect(h["referrer-policy"], path).toBe("same-origin");
  expect(h["x-robots-tag"], path).toBe("noindex, nofollow, noarchive");
}

test.describe("private link pages", () => {
  for (const p of PAGES)
    test(`signed out, ${p.path.split("/")[1]} shows the address masked, in the HTML and the RSC data`, async ({ page }) => {
      const { html, rsc, headers, rscHeaders } = await fetchBoth(page.request, p.path);
      for (const body of [html, rsc]) {
        expect(body.toLowerCase()).not.toContain(p.email.toLowerCase());
        expect(body).not.toContain(encodeURIComponent(p.email));
      }
      expect(html).toContain(p.masked);
      expectPrivateHeaders(headers, p.path);
      expectPrivateHeaders(rscHeaders, p.path);
      // Nothing private in the title or link-preview tags either.
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head).not.toContain(p.masked);
      expect(head).not.toMatch(/og:(title|description)[^>]*@/);
    });

  test("a different account on the invite sees the invited address masked, and its own", async ({ page }) => {
    await logIn(page, "stranger@floortest.test");
    await page.goto(`/join/${LINKS.inviteSecret}`);
    await expect(page.getByRole("alert").filter({ hasText: "This invite was sent to" })).toContainText(`This invite was sent to ${LINKS.invitee.masked}, but you're signed in as stranger@floortest.test`);
    const { html, rsc } = await fetchBoth(page.request, `/join/${LINKS.inviteSecret}`);
    for (const body of [html, rsc]) expect(body).not.toContain(LINKS.invitee.email);
  });

  // Runs before the invitee joins below (one worker, in order): the invite must still be live.
  test("signed out, sign-up from the invite shows the invited address masked and doesn't fill it in", async ({ page }) => {
    const path = `/signup?team=${LINKS.inviteSecret}`;
    const { html, rsc } = await fetchBoth(page.request, path);
    for (const body of [html, rsc]) {
      expect(body.toLowerCase()).not.toContain(LINKS.invitee.email.toLowerCase());
      expect(body).not.toContain(encodeURIComponent(LINKS.invitee.email));
    }
    expect(html).toContain(LINKS.invitee.masked);
  });

  test("signed in as the invitee, the invite shows the full address and joining works", async ({ page }) => {
    await logIn(page, LINKS.invitee.email);
    await page.goto(`/join/${LINKS.inviteSecret}`);
    await expect(page.getByText(`You're signed in as ${LINKS.invitee.email}`)).toBeVisible();
    const join = page.getByRole("button", { name: `Join ${LINKS.desk.name}` });
    await hydrated(join);
    await join.click();
    await page.waitForURL(/\/dashboard\/floor/);
  });

  test("signed in as the account, verify-email shows the full address and confirming works", async ({ page }) => {
    await logIn(page, LINKS.unverified.email);
    await page.goto(`/verify-email/${LINKS.verifyToken}`);
    await expect(page.getByText(`Confirm ${LINKS.unverified.email} belongs to you.`)).toBeVisible();
    await page.getByRole("button", { name: "Confirm my email" }).click();
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  });

  test("signed in as the account, confirm-email shows the new address in full and confirming works", async ({ page }) => {
    await logIn(page, LINKS.changer.email);
    await page.goto(`/confirm-email/${LINKS.confirmToken}`);
    await expect(page.getByText(`Make ${LINKS.changer.next} the email for your FloorTest account`)).toBeVisible();
    await page.getByRole("button", { name: "Confirm new email" }).click();
    await expect(page.getByRole("heading", { name: "Email changed" })).toBeVisible();
  });

  test("the receipt's stop-sharing action still works with the same-origin referrer policy", async ({ page }) => {
    await page.goto(`/receipt/${LINKS.receiptToken}`);
    await expect(page.getByText(LINKS.sender.masked).first()).toBeVisible();
    const stop = page.getByRole("button", { name: "Stop private sharing" });
    await hydrated(stop);
    await stop.click();
    await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
    // The action refreshes the receipt, which then has nothing left to stop: the switch (and its "Stopping…" state) is
    // gone, and stays gone after a reload.
    await expect(page.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(LINKS.sender.title)).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop private sharing" })).toHaveCount(0);
  });

  test("the sender history's End this link action still works", async ({ page }) => {
    await gotoSent(page);
    await page.getByRole("button", { name: "End this link now" }).click();
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });
});

async function gotoSent(page: Page) {
  await page.goto(`/sent/${LINKS.sentToken}`);
  await expect(page.getByText(`Private · ${LINKS.sender.masked}`)).toBeVisible();
}
