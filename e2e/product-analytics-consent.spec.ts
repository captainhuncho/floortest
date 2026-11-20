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

// Withdrawing while PostHog is live reloads the page (that ends PostHog's retry queue); the banner asks again after it.
async function acceptThenOpenSettings(page: Page, sent: { url: string }[]) {
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await Promise.all([page.waitForEvent("load"), page.getByRole("link", { name: "Cookie settings" }).first().click()]);
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
  for (const { url } of sent) expect(new URL(url).host).toBe("eu.i.posthog.com");
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

test("Accept, then Cookie settings and Not now: nothing leaves across the reload, beacons included", async ({ page }) => {
  const { sent } = await watch(page);
  await acceptThenOpenSettings(page, sent);
  const before = sent.length;
  await page.getByRole("button", { name: "Not now" }).click();
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

/** Replay bodies with PostHog's compressed frame fields (gzip in a latin1 string) unpacked, as one searchable text. */
function replayText(sent: { url: string; body: string }[]): string {
  const unpack = (v: unknown): unknown => {
    if (typeof v === "string" && v.charCodeAt(0) === 0x1f && v.charCodeAt(1) === 0x8b) {
      try {
        const text = gunzipSync(Buffer.from(v, "latin1")).toString("utf8");
        try {
          return unpack(JSON.parse(text));
        } catch {
          return text;
        }
      } catch {
        return v;
      }
    }
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpack(x)]));
    return v;
  };
  return replay(sent)
    .map((s) => {
      try {
        return JSON.stringify(unpack(JSON.parse(s.body)));
      } catch {
        return s.body;
      }
    })
    .join("\n");
}

const FULL_SNAPSHOT = /"type":2,"data":\{"node"/;

// PostHog's recorder uploads nothing until the visitor interacts with the page, so the tests move the mouse like one.
async function interact(page: Page) {
  for (const [x, y] of [[300, 300], [340, 330], [380, 360], [420, 390]]) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
  }
}

test("signed in, replay runs on an allowed page and hides searches, typed text, page text and attributes", async ({ page, baseURL }) => {
  const { sent } = await watch(page);
  await signedInAccepted(page, baseURL);
  await page.goto(`/dashboard/review?q=${SECRET}&sender=${SECRET}&utm_term=${SECRET}&p=2`);
  const facts = await page.evaluate(() => {
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
    const heading = [...document.querySelectorAll("h1, h2")].find(visible)?.textContent?.trim() ?? "";
    const label = [...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label") ?? "").find((v) => v.length >= 6) ?? "";
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/dashboard/"]')].map((a) => a.getAttribute("href") ?? "").find((h) => !h.startsWith("/dashboard/review")) ?? "";
    return { heading, label, link };
  });
  const field = page.locator('input[type="search"], input[type="text"]').first();
  if (await field.count()) await field.pressSequentially(`${SECRET}typed`);
  await interact(page);
  await page.evaluate((secret) => history.pushState({}, "", `/dashboard/review?q=${secret}2`), SECRET);
  await expect.poll(() => replayText(sent), { timeout: 30_000 }).toContain("/dashboard/review");
  await expect.poll(() => replayText(sent), { timeout: 30_000 }).toMatch(FULL_SNAPSHOT);
  await page.waitForTimeout(4000);
  const events = allText(sent.filter((x) => !replay([x]).length));
  const frames = replayText(sent);
  expect(frames).toContain("/dashboard/review");
  expect(`${events}\n${frames}`).not.toContain(SECRET);
  expect(facts.heading.length).toBeGreaterThan(3);
  expect(frames).not.toContain(facts.heading);
  expect(facts.label).not.toBe("");
  expect(frames).not.toContain(facts.label);
  expect(facts.link).not.toBe("");
  expect(frames).not.toContain(`"${facts.link}"`);
});

test("replay never runs on sign-in, sign-up or pricing pages", async ({ page, baseURL }) => {
  const { sent } = await watch(page);
  await page.context().addCookies([{ name: "ft_consent", value: "accepted", url: baseURL ?? "http://localhost:3000" }]);
  for (const path of ["/login", "/signup", "/pricing"]) {
    await page.goto(path);
    await interact(page);
    await page.waitForTimeout(2500);
  }
  expect(allText(sent)).toContain("$pageview");
  expect(replay(sent)).toEqual([]);
});

test("moving from a recorded page to one that may not be recorded sends no frames from it", async ({ page, baseURL }) => {
  const { sent } = await watch(page);
  await signedInAccepted(page, baseURL);
  await page.goto("/dashboard/floor");
  await interact(page);
  await expect.poll(() => replayText(sent), { timeout: 30_000 }).toMatch(FULL_SNAPSHOT);
  const target = await page.evaluate(() =>
    ["/dashboard/contacts", "/dashboard/settings", "/dashboard/account"].find((h) =>
      [...document.querySelectorAll<HTMLAnchorElement>(`a[href="${h}"]`)].some((a) => a.offsetParent !== null),
    ),
  );
  expect(target).toBeTruthy();
  await page.locator(`a[href="${target}"]:visible`).first().click();
  await page.waitForURL(`**${target}`);
  const framesBefore = replay(sent).length;
  await interact(page);
  await page.waitForTimeout(5000);
  expect(allText(sent)).toContain(target!);
  expect(replayText(replay(sent).slice(framesBefore))).not.toContain(target!);
  // No frame anywhere carries the unrecorded page as its address (rrweb Meta href or a custom page event).
  expect(replayText(sent)).not.toContain(`${new URL(page.url()).origin}${target}`);
});

test("an event that failed before Cookie settings is never resent after it", async ({ page }) => {
  const { sent } = await watch(page);
  let failed = false;
  // The first event send fails (a server error), so PostHog keeps it in its retry queue.
  await page.route(/^https:\/\/eu\.i\.posthog\.com\/e\//, (route) => {
    if (failed) return route.fallback();
    failed = true;
    sent.push({ url: route.request().url(), body: "" });
    return route.fulfill({ status: 503, body: "" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => failed, { timeout: 20_000 }).toBe(true);
  await Promise.all([page.waitForEvent("load"), page.getByRole("link", { name: "Cookie settings" }).first().click()]);
  const before = sent.length;
  await page.waitForTimeout(10_000);
  expect(sent.slice(before)).toEqual([]);
});

test("withdrawing while PostHog is still downloading: it never starts and stores nothing", async ({ page }) => {
  const { sent } = await watch(page);
  // Hold back the file that holds PostHog itself (only it has this method name).
  let held = false;
  await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("_handle_unload")) {
      held = true;
      await new Promise((done) => setTimeout(done, 4000));
    }
    return route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await page.evaluate(() => {
    location.hash = "cookie-settings";
  });
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
  await page.waitForTimeout(6000);
  expect(held).toBe(true);
  expect(sent).toEqual([]);
  expect(
    await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => /^(ph_|__ph|_postHog)/.test(k))),
  ).toEqual([]);
});
