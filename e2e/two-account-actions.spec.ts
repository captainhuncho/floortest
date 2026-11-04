import fs from "node:fs";
import { expect, FAKE_TURNSTILE, logIn, test } from "./fixtures";
import type { APIRequestContext, APIResponse, Browser, Page } from "@playwright/test";

/**
 * Two accounts, part 2 (Safety's two-account list, 4 Nov; part 1 is two-account.spec.ts). Sam (stranger@) calls the
 * real server actions, over HTTP as the browser does, with Maxwell's (demo@) and Tia's team (teams@) actual ids. Each
 * answer must be the same as for an id that doesn't exist, and nothing of theirs may change.
 *
 * Server actions are called by id: the dev server writes each action's id, file and export name to its manifest
 * once a page that uses it has compiled, so the pages are opened first.
 */
test.describe.configure({ mode: "serial" });

type Act = { id: string; path: string };
type Arg = unknown;
const MANIFEST = ".next/dev/server/server-reference-manifest.json";
const PAGES = ["/dashboard/review", "/dashboard/collections", "/dashboard/settings/team"];
const MARK = "zz-sam-was-here";

/** Each wanted action's id, and a page it can be posted to (from its compiled workers, route groups dropped). */
async function actions(page: Page, names: string[]): Promise<Record<string, Act>> {
  for (const p of PAGES) await page.goto(p);
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).node as Record<string, { workers: Record<string, unknown>; filename: string; exportedName: string }>;
  const out: Record<string, Act> = {};
  for (const [id, v] of Object.entries(m)) {
    if (!names.includes(v.exportedName) || !v.filename.startsWith("src/app/dashboard/actions/")) continue;
    const worker = Object.keys(v.workers).find((w) => !w.includes("["));
    if (worker) out[v.exportedName] = { id, path: worker.replace(/^app/, "").replace(/\/page$/, "").replace(/\/\([^)]+\)/g, "") || "/" };
  }
  for (const n of names) expect(out[n], `${n} compiled`).toBeTruthy();
  return out;
}

/** A form argument, sent the way React sends one: its fields prefixed with the reference number. */
const form = (fields: Record<string, string>) => ({ $form: fields });

/** Calls a server action with these arguments, as the signed-in browser of `r` would. */
function call(r: APIRequestContext, base: string, a: Act, args: Arg[]) {
  const headers = { "Next-Action": a.id, Accept: "text/x-component", Origin: base };
  const i = args.findIndex((x) => typeof x === "object" && x !== null && "$form" in x);
  if (i < 0) return r.post(a.path, { headers: { ...headers, "Content-Type": "text/plain;charset=UTF-8" }, data: JSON.stringify(args), maxRedirects: 0 });
  const multipart: Record<string, string> = { "0": JSON.stringify(args.map((x, j) => (j === i ? "$K1" : x))) };
  for (const [k, v] of Object.entries((args[i] as { $form: Record<string, string> }).$form)) multipart[`1_${k}`] = v;
  return r.post(a.path, { headers, multipart, maxRedirects: 0 });
}

/**
 * What an answer says: its status, where it sends the browser, and its body, without what changes on every request
 * anyway (the CSP nonce and React's random render keys).
 */
const answer = async (res: APIResponse) => ({
  status: res.status(),
  redirect: res.headers()["x-action-redirect"] ?? "",
  body: (await res.text()).replace(/"nonce":"[^"]*"/g, '"nonce":""').replace(/"\$L[0-9a-f]+","[A-Za-z0-9_-]{20,24}"/g, '"$L","key"'),
});

/** Asserts another desk's ids get the answer a missing id gets, and that the action ran (no 500). */
const sameAs = (r: APIRequestContext, base: string, A: Record<string, Act>) => async (what: string, name: string, theirs: Arg[], none: Arg[]) => {
  const a = await answer(await call(r, base, A[name], theirs));
  const b = await answer(await call(r, base, A[name], none));
  expect(a, what).toEqual(b);
  expect(a.status, `${what}: the action ran`).toBeLessThan(500);
};

const appLogin = async (request: APIRequestContext, email: string) => {
  const r = await request.post("/api/v1/auth/login", { data: { email, password: "floortest-demo", humanToken: "XXXX.DUMMY.TOKEN.XXXX" } });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
};
const queueOf = async (request: APIRequestContext, auth: Record<string, string>) =>
  (await (await request.get("/api/v1/queue", { headers: auth })).json()).tracks as { id: number; title: string }[];

/** A second browser, set up as the `page` fixture is (consent saved, the fake bot check, focus), signed in as `email`. */
async function signedIn(browser: Browser, baseURL: string, email: string) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "ft_consent", value: "rejected", url: baseURL }]);
  await ctx.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
  const page = await ctx.newPage();
  await page.goto("/api/health");
  await page.bringToFront();
  await logIn(page, email);
  return { ctx, page };
}

/** Maxwell's desk as Maxwell sees it: the queue, the collections, and each sender's page (notes, replies, blocked). */
async function maxwellDesk(page: Page, request: APIRequestContext, senders: number[]) {
  const max = await appLogin(request, "demo@floortest.test");
  const queue = await (await request.get("/api/v1/queue", { headers: max })).text();
  const collections = await (await request.get("/api/v1/collections", { headers: max })).text();
  const pages: string[] = [];
  // "2m ago" turns into "3m ago" on its own while the test runs: compare what the page says, not the clock.
  const read = async () => (await page.locator("main").innerText()).replace(/\b\d+\s?(?:s|m|h|d|min|mins|hr|hrs)\s+ago\b/g, "ago");
  for (const s of senders) {
    await page.goto(`/dashboard/contacts/${s}`);
    // Read once the page has streamed in, not its loading state.
    await expect(page.locator("main")).toContainText("Contact since");
    pages.push(await read());
  }
  await page.goto("/dashboard/contacts?show=blocked");
  await page.waitForLoadState("networkidle");
  pages.push(await read());
  return { queue, collections, pages };
}

test("dashboard actions with another desk's ids answer as missing ones and change nothing", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(240_000);
  const max = await appLogin(request, "demo@floortest.test");
  const tracks = await queueOf(request, max);
  const collection = ((await (await request.get("/api/v1/collections", { headers: max })).json()).collections as { id: number }[])[0];
  expect(tracks[0]?.id && collection?.id).toBeTruthy();
  // Maxwell's senders, from the links on his Contacts page.
  const { ctx: mctx, page: mpage } = await signedIn(browser, baseURL!, "demo@floortest.test");
  await mpage.goto("/dashboard/contacts");
  const hrefs = await mpage.locator("a[href^='/dashboard/contacts/']").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const senders = [...new Set(hrefs.map((h) => Number(/\/contacts\/(\d+)/.exec(h)?.[1])).filter(Boolean))];
  expect(senders.length).toBeGreaterThan(0);
  const before = await maxwellDesk(mpage, request, senders);

  await logIn(page, "stranger@floortest.test");
  const A = await actions(page, ["updateCollection", "moveTrack", "batchTracks", "blockSender", "savePrep", "playedOut", "askForStems", "decideRelease", "addNote", "replyToSender"]);
  const same = sameAs(page.request, baseURL!, A);
  const T = tracks[0].id;
  const C = collection.id;
  await same("rename Maxwell's collection", "updateCollection", [C, form({ name: MARK, description: MARK })], [999999, form({ name: MARK, description: MARK })]);
  await same("move Maxwell's track", "moveTrack", [T, form({ collection: String(C) })], [999999, form({ collection: "999999" })]);
  await same("batch Maxwell's tracks", "batchTracks", [tracks.map((t) => t.id), { type: "kept" }], [tracks.map((_, i) => 999999 - i), { type: "kept" }]);
  await same("prep on Maxwell's track", "savePrep", [T, 9, [{ at: 1, label: MARK }]], [999999, 9, [{ at: 1, label: MARK }]]);
  await same("played out Maxwell's track", "playedOut", [T, MARK], [999999, MARK]);
  await same("stems request on Maxwell's track", "askForStems", [T], [999999]);
  // decideRelease looks only at the caller's own desk by release name; Sam has none, so this proves the empty case.
  await same("decide a release", "decideRelease", ["unsigned", "passed"], ["no-such-release", "passed"]);
  for (const s of senders) {
    await same(`block Maxwell's sender ${s}`, "blockSender", [s, true], [999999, true]);
    await same(`note on Maxwell's sender ${s}`, "addNote", [s, T, form({ body: MARK })], [999999, 999999, form({ body: MARK })]);
    await same(`reply to Maxwell's sender ${s}`, "replyToSender", [s, T, form({ body: MARK })], [999999, 999999, form({ body: MARK })]);
  }

  // Nothing of Maxwell's changed: queue, collections, every sender page and the blocked list read the same.
  const after = await maxwellDesk(mpage, request, senders);
  await mctx.close();
  expect(after).toEqual(before);
  expect(after.pages.join("\n")).not.toContain(MARK);
});

/** The waiting tracks' ids on Tia's desk, as Lena sees them after switching to it. */
async function tiaWaiting(browser: Browser, baseURL: string) {
  const { ctx, page } = await signedIn(browser, baseURL, "listener@floortest.test");
  await page.getByText("Switch desk").click();
  await page.getByRole("button", { name: /Tia Teams/ }).click();
  await expect(page.getByText(/On Tia Teams.s desk as a member/)).toBeVisible();
  await page.goto("/dashboard/review");
  const hrefs = await page.locator("a[href*='/dashboard/review']").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  await ctx.close();
  return [...new Set(hrefs.map((h) => Number(/(?:track|t)=(\d+)|review\/(\d+)/.exec(h)?.slice(1).find(Boolean))).filter(Boolean))];
}

test("a batch with one's own and another desk's tracks changes only one's own", async ({ page, request, browser, baseURL }) => {
  const mine = (await queueOf(request, await appLogin(request, "demo@floortest.test")))[0];
  const theirs = (await tiaWaiting(browser, baseURL!))[0];
  expect(mine?.id && theirs).toBeTruthy();
  await logIn(page, "demo@floortest.test");
  const A = await actions(page, ["batchTracks"]);
  const res = await answer(await call(page.request, baseURL!, A.batchTracks, [[mine.id, theirs], { type: "kept" }]));
  expect(res.body).toMatch(/"done":1,"skipped":1/);
  // Put Maxwell's track back as it was (undecided).
  const back = await answer(await call(page.request, baseURL!, A.batchTracks, [[mine.id], { type: "clear" }]));
  expect(back.body).toMatch(/"done":1/);
  expect(await tiaWaiting(browser, baseURL!), "Tia's track still waiting, undecided").toContain(theirs);
});

test("team actions with another account's member, invite and held-reply ids answer as missing ones", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  // Lena works Tia's desk: her desk switcher shows it before and after.
  const { ctx: lctx, page: lpage } = await signedIn(browser, baseURL!, "listener@floortest.test");
  await expect(lpage.getByText("Tia Teams").first()).toBeAttached();

  await logIn(page, "stranger@floortest.test");
  const same = sameAs(page.request, baseURL!, await actions(page, ["removeTeammate", "changeTeamRole", "cancelTeamInvite", "answerHeldReply"]));
  // Every row the seed and earlier specs can have made (Sam has no team of his own, so none of these is his).
  for (let id = 1; id <= 12; id++) {
    await same(`change role of member ${id}`, "changeTeamRole", [id, "admin"], [999999, "admin"]);
    await same(`cancel invite ${id}`, "cancelTeamInvite", [id], [999999]);
    await same(`answer held reply ${id}`, "answerHeldReply", [id, true, form({ body: MARK })], [999999, true, form({ body: MARK })]);
    await same(`remove member ${id}`, "removeTeammate", [id], [999999]);
  }

  // Lena is still on Tia's team.
  await lpage.goto("/dashboard/floor");
  await expect(lpage.getByText("Tia Teams").first()).toBeAttached();
  await lctx.close();
});

test("a stem opens only under its own track, even on the same desk", async ({ page, request }) => {
  const tracks = await queueOf(request, await appLogin(request, "demo@floortest.test"));
  const low = tracks.find((t) => t.title === "Low Orbit");
  const other = tracks.find((t) => t.title !== "Low Orbit");
  expect(low && other).toBeTruthy();
  await logIn(page, "demo@floortest.test");
  const r = page.request;
  // The seeded stem: the first id that opens under Low Orbit.
  let stem = 0;
  for (let id = 1; id <= 20 && !stem; id++) if ((await r.get(`/api/tracks/${low!.id}/stems/${id}`, { maxRedirects: 0 })).status() === 200) stem = id;
  expect(stem, "the seeded stem opens under its own track").toBeGreaterThan(0);
  const wrong = await r.get(`/api/tracks/${other!.id}/stems/${stem}`, { maxRedirects: 0 });
  const none = await r.get(`/api/tracks/${other!.id}/stems/999999`, { maxRedirects: 0 });
  expect(wrong.status()).toBe(404);
  expect(wrong.status()).toBe(none.status());
  expect(await wrong.text()).toBe(await none.text());
});
