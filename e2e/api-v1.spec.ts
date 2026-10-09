import { expect, test } from "@playwright/test";

/** The mobile app's API, end to end: sign in, read the queue, decide, refresh, sign out — and the guards around it. */
test.describe.configure({ mode: "serial" });

test("app sign-in, queue, keep, token refresh and sign-out", async ({ request }) => {
  // Wrong password: one message, no hint whether the account exists.
  const bad = await request.post("/api/v1/auth/login", { data: { email: "demo@floortest.test", password: "nope-nope-nope" } });
  expect(bad.status()).toBe(401);
  expect((await bad.json()).error).toBe("Email or password is incorrect.");

  const login = await request.post("/api/v1/auth/login", { data: { email: "demo@floortest.test", password: "floortest-demo", device: "E2E phone" } });
  expect(login.status()).toBe(200);
  const t = await login.json();
  expect(t.accessToken).toBeTruthy();
  expect(t.refreshToken).toBeTruthy();
  const auth = { Authorization: `Bearer ${t.accessToken}` };

  const me = await (await request.get("/api/v1/me", { headers: auth })).json();
  expect(me.handle).toBe("maxwell");

  const queue = await (await request.get("/api/v1/queue", { headers: auth })).json();
  expect(queue.tracks.length).toBeGreaterThan(0);
  const first = queue.tracks[0];

  const audio = await request.get(`/api/v1/tracks/${first.id}/audio`, { headers: auth });
  expect(audio.status()).toBe(200);

  expect((await request.post(`/api/v1/tracks/${first.id}/decision`, { headers: auth, data: { decision: "kept" } })).status()).toBe(200);
  const after = await (await request.get("/api/v1/queue", { headers: auth })).json();
  expect(after.tracks.find((x: { id: number }) => x.id === first.id)).toBeUndefined();
  expect((await request.post(`/api/v1/tracks/${first.id}/decision`, { headers: auth, data: { decision: "maybe" } })).status()).toBe(400);

  // Refresh rotates: the new pair works, the old refresh token doesn't.
  const r1 = await request.post("/api/v1/auth/refresh", { data: { refreshToken: t.refreshToken } });
  expect(r1.status()).toBe(200);
  const t2 = await r1.json();
  expect((await request.post("/api/v1/auth/refresh", { data: { refreshToken: t.refreshToken } })).status()).toBe(401);
  // The old access token's session is gone too.
  expect((await request.get("/api/v1/me", { headers: auth })).status()).toBe(401);

  // Sign out ends the session at once.
  const auth2 = { Authorization: `Bearer ${t2.accessToken}` };
  expect((await request.post("/api/v1/auth/logout", { headers: auth2, data: { refreshToken: t2.refreshToken } })).status()).toBe(200);
  expect((await request.get("/api/v1/me", { headers: auth2 })).status()).toBe(401);
});

test("no token, a forged token, or someone else's track gets nothing", async ({ request }) => {
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  expect((await request.get("/api/v1/me", { headers: { Authorization: "Bearer 1.abc.9999999999999.forged" } })).status()).toBe(401);
  const login = await (await request.post("/api/v1/auth/login", { data: { email: "demo@floortest.test", password: "floortest-demo" } })).json();
  const auth = { Authorization: `Bearer ${login.accessToken}` };
  expect((await request.get("/api/v1/tracks/999999/audio", { headers: auth })).status()).toBe(404);
  expect((await request.post("/api/v1/tracks/999999/decision", { headers: auth, data: { decision: "kept" } })).status()).toBe(404);
});

test("an app refresh token can't be used as a browser session", async ({ browser, request }) => {
  const login = await (await request.post("/api/v1/auth/login", { data: { email: "demo@floortest.test", password: "floortest-demo" } })).json();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "floortest_session", value: login.refreshToken, url: "http://localhost:3210" }]);
  const page = await ctx.newPage();
  await page.goto("/dashboard/floor");
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});
