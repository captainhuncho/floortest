import type { APIRequestContext } from "@playwright/test";
import { expect, logIn, test, wav, TEST_PASSWORD } from "./fixtures";

/** Sends one short track to the demo desk through the app API (same checks as the website). */
async function sendTo(request: APIRequestContext, auth: Record<string, string>, genre: string, title: string) {
  const file = wav(2);
  const start = await request.post("/api/v1/sends", {
    headers: auth,
    data: { to: "maxwell", title, artist: "Live Artist", genre, mix_status: "mastered", release_status: "unsigned", ai_use: "none", fileName: `${title}.wav`, size: file.length },
  });
  expect(start.status()).toBe(200);
  const { uploadId, target } = await start.json();
  expect((await request.put(target.url, { headers: target.headers, data: file })).ok()).toBe(true);
  expect((await request.post("/api/v1/sends/complete", { headers: auth, data: { to: "maxwell", uploadId, duration: 2 } })).status()).toBe(200);
}

// The Floor keeps itself current: a track sent while it's open shows under Up next without a reload,
// even on a busy desk (more tracks waiting than Up next has room for).
test("a track sent while the Floor is open appears in Up next by itself", async ({ page, request }) => {
  // Two senders (each link takes up to 5 tracks a day from one person).
  const login = async (email: string) => ({ Authorization: `Bearer ${(await (await request.post("/api/v1/auth/login", { data: { email, password: TEST_PASSWORD } })).json()).accessToken}` });
  const [auth, other] = [await login("listener@floortest.test"), await login("stranger@floortest.test")];
  const genre = (await (await request.get("/api/v1/receivers/maxwell", { headers: auth })).json()).genres[0];
  const stamp = Date.now().toString(36);
  // A busy desk: more already waiting than Up next has room for.
  for (let i = 1; i <= 6; i++) await sendTo(request, i <= 3 ? auth : other, genre, `Waiting ${stamp} ${i}`);

  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");
  const upNext = page.locator('section[aria-labelledby="next-h"]');
  const title = `Live ${stamp}`;
  await expect(upNext).toBeVisible();
  await expect(upNext.getByText(title)).toHaveCount(0);

  await sendTo(request, auth, genre, title);

  // No reload: the page's own check (every 10 s) brings it in.
  await expect(upNext.getByText(title)).toBeVisible({ timeout: 30_000 });
});
