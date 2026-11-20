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

/** Holds back full page loads (documents) while armed, like a reload on a slow phone connection. */
async function slowDocuments(page: Page, ms: number) {
  const state = { armed: false, held: 0 };
  await page.route(
    (url) => !url.hostname.endsWith("posthog.com"),
    async (route) => {
      if (state.armed && route.request().resourceType() === "document") {
        state.held += 1;
        await new Promise((done) => setTimeout(done, ms));
      }
      return route.fallback();
    },
  );
  return state;
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

test("between Cookie settings and the reload landing, a click and a client navigation send nothing", async ({ page }) => {
  const { sent } = await watch(page);
  const slow = await slowDocuments(page, 6000);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const before = sent.length;
  slow.armed = true;
  // The old page stays on screen and alive until the slowed reload commits: PostHog is still loaded on it.
  const landed = page.waitForEvent("load", { timeout: 20_000 });
  const started = Date.now();
  await page.evaluate(() => {
    location.hash = "cookie-settings";
  });
  await expect.poll(() => slow.held, { timeout: 5_000 }).toBeGreaterThan(0);
  await page.mouse.click(5, 5).catch(() => {});
  await page.evaluate(() => history.pushState({}, "", "/pricing?view=after")).catch(() => {});
  await landed;
  // The reload really was held back, so the click and navigation happened on the old, still-live page.
  expect(Date.now() - started).toBeGreaterThan(5000);
  await page.waitForTimeout(2000);
  expect(sent.slice(before)).toEqual([]);
});

test("a session that starts on an address with campaign values never sends them, also as session-entry properties", async ({ page, baseURL }) => {
  const { sent } = await watch(page);
  await page.context().addCookies([{ name: "ft_consent", value: "accepted", url: baseURL ?? "http://localhost:3000" }]);
  await page.goto(`/?utm_term=${SECRET}&utm_content=${SECRET}&gclid=${SECRET}&gad_source=${SECRET}&bfcid=${SECRET}`);
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.goto("/pricing");
  await page.waitForTimeout(2500);
  const all = allText(sent);
  // The bodies carry PostHog's session-entry properties, so the check below is real.
  expect(all).toContain("$session_entry_");
  expect(all).not.toContain(SECRET);
});

test("Cookie settings in one tab stops PostHog in another open tab, and its storage stays gone", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  const watchA = await watch(a);
  const watchB = await watch(b);
  await a.goto("/");
  await a.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => watchA.sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await b.goto("/pricing");
  await expect.poll(() => watchB.sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => phStorage(b).then((k) => k.length), { timeout: 10_000 }).toBeGreaterThan(0);
  await a.bringToFront();
  await Promise.all([a.waitForEvent("load"), a.getByRole("link", { name: "Cookie settings" }).first().click()]);
  // Tab B is told and reloads: the banner asks again there, with nothing of PostHog's kept.
  await expect(b.getByRole("button", { name: "Accept" })).toBeVisible({ timeout: 15_000 });
  const beforeB = watchB.sent.length;
  await b.mouse.move(200, 200);
  await b.waitForTimeout(3000);
  expect(watchB.sent.slice(beforeB)).toEqual([]);
  expect(await phStorage(b)).toEqual([]);
  expect(await phStorage(a)).toEqual([]);
});

test("a tab that missed the withdrawal stops when it comes back into view", async ({ page, context, baseURL }) => {
  const { sent } = await watch(page);
  await context.addCookies([{ name: "ft_consent", value: "accepted", url: baseURL ?? "http://localhost:3000" }]);
  await page.goto("/pricing");
  await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => phStorage(page).then((k) => k.length), { timeout: 10_000 }).toBeGreaterThan(0);
  // Consent withdrawn elsewhere (a tab with no channel, a page restored from the back-forward cache): only the cookie changed.
  await context.clearCookies({ name: "ft_consent" });
  const before = sent.length;
  await Promise.all([page.waitForEvent("load"), page.evaluate(() => window.dispatchEvent(new Event("focus")))]);
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(sent.slice(before)).toEqual([]);
  expect(await phStorage(page)).toEqual([]);
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
  const field = page.locator("#q");
  await expect(field).toBeVisible();
  await field.pressSequentially("zq9typedtext");
  await interact(page);
  await page.evaluate((secret) => history.pushState({}, "", `/dashboard/review?q=${secret}2`), SECRET);
  await expect.poll(() => replayText(sent), { timeout: 30_000 }).toContain("/dashboard/review");
  await expect.poll(() => replayText(sent), { timeout: 30_000 }).toMatch(FULL_SNAPSHOT);
  await page.waitForTimeout(4000);
  const events = allText(sent.filter((x) => !replay([x]).length));
  const frames = replayText(sent);
  expect(frames).toContain("/dashboard/review");
  expect(`${events}\n${frames}`).not.toContain(SECRET);
  expect(frames).not.toContain("zq9typedtext");
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
  const recording = () => page.evaluate(() => (window as unknown as { __ftRecording?: () => boolean }).__ftRecording?.() ?? null);
  expect(await recording()).toBe(true);
  await page.locator(`a[href="${target}"]:visible`).first().click();
  await page.waitForURL(`**${target}`);
  // The recorder itself stopped with the move, not only the frames being dropped on the way out.
  expect(await recording()).toBe(false);
  const framesBefore = replay(sent).length;
  await interact(page);
  await page.waitForTimeout(5000);
  expect(allText(sent)).toContain(target!);
  expect(replayText(replay(sent).slice(framesBefore))).not.toContain(target!);
  // Back to the recorded page and forward again: recording resumes there and stops again here.
  await page.goBack();
  await page.waitForURL("**/dashboard/floor");
  await expect.poll(recording, { timeout: 10_000 }).toBe(true);
  await page.goForward();
  await page.waitForURL(`**${target}`);
  await expect.poll(recording, { timeout: 5_000 }).toBe(false);
  await interact(page);
  // A pushState to the unrecorded page from a recorded one: frames from it are still never sent.
  await page.goBack();
  await page.waitForURL("**/dashboard/floor");
  await page.evaluate((t) => history.pushState({}, "", t), target!);
  await interact(page);
  await page.waitForTimeout(5000);
  // No frame anywhere carries the unrecorded page as its address (rrweb Meta href or a custom page event).
  expect(replayText(sent)).not.toContain(`${new URL(page.url()).origin}${target}`);
});

test("an event that failed before Cookie settings is never resent, even while a slow reload is still loading", async ({ page }) => {
  const { sent } = await watch(page);
  const slow = await slowDocuments(page, 9000);
  let failed = false;
  // The first event send fails (a server error), so PostHog keeps it in its retry queue (first retry due within ~4 s).
  await page.route(/^https:\/\/eu\.i\.posthog\.com\/e\//, (route) => {
    if (failed) return route.fallback();
    failed = true;
    sent.push({ url: route.request().url(), body: "" });
    return route.fulfill({ status: 503, body: "" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => failed, { timeout: 20_000 }).toBe(true);
  const before = sent.length;
  slow.armed = true;
  // The reload takes 9 s to land, so the retry falls due while the old page (with PostHog) is still alive.
  const landed = page.waitForEvent("load", { timeout: 25_000 });
  const started = Date.now();
  await page.evaluate(() => {
    location.hash = "cookie-settings";
  });
  await expect.poll(() => slow.held, { timeout: 5_000 }).toBeGreaterThan(0);
  await landed;
  // The old page stayed alive for the whole held reload, past the first retry's due time.
  expect(Date.now() - started).toBeGreaterThan(8000);
  await page.waitForTimeout(4000);
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
