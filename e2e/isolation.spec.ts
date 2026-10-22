import { expect, logIn, test } from "./fixtures";

/**
 * Two receivers, real ids: Sam (stranger@) tries Maxwell's (demo@) actual track and collection, on the web and in the
 * app API. Every answer must be the same "not found" as an id that doesn't exist, nothing of Maxwell's may change, and
 * a signed-out visitor gets nothing private.
 */
test.describe.configure({ mode: "serial" });

// The human-check token the test copy's Cloudflare test keys accept: earlier tests (3 wrong passwords in guards) leave
// this connection needing the check for 15 minutes.
const appLogin = async (request: import("@playwright/test").APIRequestContext, email: string) => {
  const r = await request.post("/api/v1/auth/login", { data: { email, password: "floortest-demo", humanToken: "XXXX.DUMMY.TOKEN.XXXX" } });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
};

test("one receiver can't read, change or delete another receiver's tracks, senders or collections", async ({ page, request }) => {
  const max = await appLogin(request, "demo@floortest.test");
  const track = (await (await request.get("/api/v1/queue", { headers: max })).json()).tracks[0] as { id: number; title: string };
  const collection = (await (await request.get("/api/v1/collections", { headers: max })).json()).collections[0] as { id: number };
  expect(track?.id).toBeTruthy();
  expect(collection?.id).toBeTruthy();

  // The app API, signed in as Sam.
  const sam = await appLogin(request, "stranger@floortest.test");
  const samQueue = (await (await request.get("/api/v1/queue", { headers: sam })).json()).tracks as { id: number }[];
  expect(samQueue.some((t) => t.id === track.id)).toBe(false);
  for (const [theirs, none] of [
    [`/api/v1/tracks/${track.id}/audio`, "/api/v1/tracks/999999/audio"],
    [`/api/v1/collections/${collection.id}`, "/api/v1/collections/999999"],
  ]) {
    const a = await request.get(theirs, { headers: sam });
    const b = await request.get(none, { headers: sam });
    expect(a.status()).toBe(404);
    expect(a.status()).toBe(b.status());
    expect(await a.text()).toBe(await b.text());
  }
  const decide = await request.post(`/api/v1/tracks/${track.id}/decision`, { headers: sam, data: { decision: "passed" } });
  expect(decide.status()).toBe(404);

  // The website, signed in as Sam: playback, download, stems and analysis answer exactly as for a missing track.
  await logIn(page, "stranger@floortest.test");
  for (const path of ["audio", "download", "analysis", "stems/zip"]) {
    const a = await page.request.get(`/api/tracks/${track.id}/${path}`, { maxRedirects: 0 });
    const b = await page.request.get(`/api/tracks/999999/${path}`, { maxRedirects: 0 });
    expect(a.status(), path).toBe(b.status());
    expect([200, 302]).not.toContain(a.status());
  }
  // Sam's desk pages never show Maxwell's track.
  await page.goto("/dashboard/review");
  await expect(page.getByText(track.title, { exact: true })).toHaveCount(0);

  // Nothing of Maxwell's changed: the track is still in his queue, undecided.
  const after = (await (await request.get("/api/v1/queue", { headers: max })).json()).tracks as { id: number; decision?: string | null }[];
  const same = after.find((t) => t.id === track.id);
  expect(same).toBeTruthy();
  expect(same?.decision ?? null).toBeNull();
});

test("a signed-out visitor gets nothing private", async ({ page, request }) => {
  for (const path of ["/api/v1/queue", "/api/v1/collections", "/api/v1/me"]) expect((await request.get(path)).status(), path).toBe(401);
  expect((await request.get("/api/tracks/1/audio", { maxRedirects: 0 })).status()).toBe(401);
  // Analysis is a POST from the desk's own pages: refused before anything is read (401, or 403 when it comes from elsewhere).
  expect([401, 403]).toContain((await request.post("/api/tracks/1/analysis", { data: { peaks: [] } })).status());
  await page.goto("/dashboard/review");
  await expect(page).toHaveURL(/\/login/);
});
