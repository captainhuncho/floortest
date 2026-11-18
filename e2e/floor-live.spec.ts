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

// The Floor keeps itself current: a track sent while it's open is counted on the Waiting crate without a reload,
// and the summary line counts it too, even on a busy desk.
test("a track sent while the Floor is open is counted on the Waiting crate by itself", async ({ page, request }) => {
  // Two senders (each link takes up to 5 tracks a day from one person).
  const login = async (email: string) => ({ Authorization: `Bearer ${(await (await request.post("/api/v1/auth/login", { data: { email, password: TEST_PASSWORD } })).json()).accessToken}` });
  const [auth, other] = [await login("listener@floortest.test"), await login("stranger@floortest.test")];
  const genre = (await (await request.get("/api/v1/receivers/maxwell", { headers: auth })).json()).genres[0];
  const stamp = Date.now().toString(36);
  // A busy desk: several already waiting.
  for (let i = 1; i <= 6; i++) await sendTo(request, i <= 3 ? auth : other, genre, `Waiting ${stamp} ${i}`);

  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");
  const waiting = page.getByRole("region", { name: "Waiting" });
  await expect(waiting).toBeVisible();
  await expect(waiting.getByRole("link", { name: /^Review/ })).toHaveAttribute("href", "/dashboard/review?view=queue");
  const count = async () => Number(await waiting.locator("p").first().innerText());
  const before = await count();
  expect(before).toBeGreaterThanOrEqual(6);
  const cameIn = async () => Number((await page.locator("#main h1 + p").innerText()).match(/^(\d+) tracks? came in/)?.[1]);
  const inBefore = await cameIn();

  await sendTo(request, auth, genre, `Live ${stamp}`);

  // No reload: the page's own check (every 10 s) brings it in.
  await expect.poll(count, { timeout: 30_000 }).toBe(before + 1);
  expect(await cameIn()).toBe(inBefore + 1);
});
