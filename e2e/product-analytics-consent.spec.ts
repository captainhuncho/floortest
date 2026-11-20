import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_TURNSTILE, logIn, POSTHOG_REQUESTS } from "./fixtures";

/**
 * PostHog loads only after Accept on the cookie banner (owner's rule): before a choice, after "Not now" and after
 * "Cookie settings" the page makes no request to PostHog and keeps nothing of its own. What is sent never carries a
 * private-link key or an invite code. PostHog is answered locally; the e2e key is made up.
 */
const SECRET = "e2esecret7788";

// PostHog drops events from browsers that look automated (a "HeadlessChrome" user agent or brand, navigator.webdriver), so the
// test browser presents as a visitor's desktop Chrome here.
test.use({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" });

function bodyText(url: string, body: Buffer | null): string {
  if (!body) return "";
  const compression = new URL(url).searchParams.get("compression");
  try {
    // Gzip is marked in the query by some versions and only by its magic bytes in others.
    if (compression === "gzip-js" || (body[0] === 0x1f && body[1] === 0x8b)) return gunzipSync(body).toString("utf8");
    if (compression === "base64") {
      const data = new URLSearchParams(body.toString("utf8")).get("data") ?? "";
      return Buffer.from(data, "base64").toString("utf8");
    }
  } catch {
    // Not what the query said: read it as sent.
  }
  return body.toString("utf8");
}

async function watch(page: Page) {
  const sent: { url: string; body: string }[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), e.blockedURI];
    });
  });
  await page.route(POSTHOG_REQUESTS, (route) => {
    const request = route.request();
    sent.push({ url: request.url(), body: bodyText(request.url(), request.postDataBuffer()) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  const cspBlocks = () => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  return { sent, cspBlocks };
}

// What PostHog keeps in the browser, apart from its opt-out record (kept while PostHog is live on the page, so it stays
// opted out; removed on the next page load).
const phStorage = (page: Page) =>
  page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage), ...document.cookie.split(";").map((c) => c.split("=")[0].trim())].filter(
      (k) => /^(ph_|__ph)/.test(k) && !k.startsWith("__ph_opt_in_out_"),
    ),
  );

const allText = (sent: { url: string; body: string }[]) => sent.map((s) => `${s.url}\n${s.body}`).join("\n");
const replay = (sent: { url: string; body: string }[]) => sent.filter((s) => new URL(s.url).pathname.startsWith("/s/"));

/** Signed in with Accept already chosen: the desk pages that may be recorded. */
async function signedInAccepted(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: "ft_consent", value: "accepted", url: baseURL ?? "http://localhost:3000" }]);
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
  await page.goto("/api/health");
  await page.bringToFront();
  await logIn(page, "demo@floortest.test");
}

async function acceptThenOpenSettings(page: Page, sent: { url: string }[]) {
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Cookie settings" }).first().click();
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
  await page.waitForTimeout(500);
}

test("nothing before a choice, nothing after Not now", async ({ page }) => {
  const { sent } = await watch(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(sent).toEqual([]);
  expect(await phStorage(page)).toEqual([]);
  await page.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await page.waitForTimeout(1500);
  expect(sent).toEqual([]);
  expect(await phStorage(page)).toEqual([]);
});

test("after Accept, events go to PostHog's EU host only, without keys, codes or page titles", async ({ page }) => {
  const { sent, cspBlocks } = await watch(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  for (const path of [`/receipt/${SECRET}`, `/c/${SECRET}`, `/signup?team=${SECRET}`, `/signup?invite=${SECRET}`]) {
    await page.goto(path);
    await page.waitForTimeout(800);
  }
  await page.goto("/");
  await page.waitForTimeout(3000);
  for (const { url } of sent) expect(["eu.i.posthog.com", "eu-assets.i.posthog.com"]).toContain(new URL(url).host);
  const all = sent.map((s) => `${s.url}\n${s.body}`).join("\n");
  // The bodies were read (decoded page views are in them), so the checks below are real.
  expect(all).toContain("$pageview");
  expect(all).toContain("/receipt/");
  expect(all).not.toContain(SECRET);
  expect(all).not.toMatch(/"(\$)?title"\s*:/);
  expect((await cspBlocks()).filter((u) => u.includes("posthog"))).toEqual([]);
});

test("Cookie settings stops PostHog at once and clears what it kept", async ({ page }) => {
  const { sent } = await watch(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => phStorage(page).then((k) => k.length), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    location.hash = "cookie-settings";
  });
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect.poll(() => phStorage(page), { timeout: 5_000 }).toEqual([]);
  const before = sent.length;
  await page.mouse.click(5, 5);
  await page.waitForTimeout(2500);
  expect(sent.length).toBe(before);
  expect(await phStorage(page)).toEqual([]);
});

test("Accept, then Not now: nothing leaves across the reload, beacons included", async ({ page }) => {
  const { sent } = await watch(page);
  await acceptThenOpenSettings(page, sent);
  const before = sent.length;
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Not now" }).click()]);
  await page.waitForTimeout(2500);
  expect(sent.length).toBe(before);
  expect(await phStorage(page)).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("__ph")))).toEqual([]);
});

test("after the footer's Cookie settings, a click and a client navigation send nothing", async ({ page }) => {
  const { sent } = await watch(page);
  await acceptThenOpenSettings(page, sent);
  const before = sent.length;
  await page.getByRole("heading").first().click();
  await page.evaluate(() => history.pushState({}, "", "/pricing?view=after"));
  await page.waitForTimeout(2500);
  expect(sent.length).toBe(before);
});

// Replay starts only when PostHog's server-side settings say so, and those are never fetched (advanced_disable_flags),
// so no recording leaves the browser at all. If replay is turned on later, these tests must assert redacted frames instead.
test("signed in, a search in the address never reaches events, and no replay is sent", async ({ page, baseURL }) => {
  const { sent } = await watch(page);
  await signedInAccepted(page, baseURL);
  await page.goto(`/dashboard/review?q=${SECRET}&sender=${SECRET}&p=2`);
  await page.evaluate((secret) => history.pushState({}, "", `/dashboard/review?q=${secret}2`), SECRET);
  await expect.poll(() => allText(sent), { timeout: 20_000 }).toContain("/dashboard/review");
  await page.waitForTimeout(3000);
  const all = allText(sent);
  expect(all).toContain("$pageview");
  expect(all).toContain("p=2");
  expect(all).not.toContain(SECRET);
  expect(replay(sent)).toEqual([]);
});

test("moving from a recordable page to one that may not be recorded sends no replay", async ({ page, baseURL }) => {
  const { sent } = await watch(page);
  await signedInAccepted(page, baseURL);
  await page.goto("/dashboard/floor");
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const target = await page.evaluate(() =>
    ["/dashboard/contacts", "/dashboard/settings", "/dashboard/account"].find((h) =>
      [...document.querySelectorAll<HTMLAnchorElement>(`a[href="${h}"]`)].some((a) => a.offsetParent !== null),
    ),
  );
  expect(target).toBeTruthy();
  await page.locator(`a[href="${target}"]:visible`).first().click();
  await page.waitForURL(`**${target}`);
  await page.waitForTimeout(3000);
  expect(allText(sent)).toContain(target!);
  expect(replay(sent)).toEqual([]);
});
