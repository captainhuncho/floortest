import { expect, test, wav } from "./fixtures";

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

test("a sender sends a track from the app; it lands on the receiver's desk and in their Prepare once kept", async ({ page, request }) => {
  // A fresh sender account, made the normal way.
  const stamp = Date.now().toString(36);
  const email = `app+${stamp}@example.test`;
  const password = "Correct-Horse-Battery-77";
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill("E2E-INVITE");
  await page.getByLabel("What best describes you?").selectOption("producer");
  await page.getByLabel("First name").fill("Appy");
  await page.getByLabel("Surname").fill("Sender");
  await page.getByLabel("Username").fill(`app${stamp}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("checkbox", { name: /18 or over/ }).check();
  await page.getByRole("button", { name: "Create my link" }).click();
  await page.waitForURL(/\/dashboard\/floor/);

  const sender = await (await request.post("/api/v1/auth/login", { data: { email, password } })).json();
  const auth = { Authorization: `Bearer ${sender.accessToken}` };

  const who = await (await request.get("/api/v1/receivers/maxwell", { headers: auth })).json();
  expect(who.found).toBe(true);
  expect(who.accepting).toBe(true);

  const title = `App Send ${stamp}`;
  const fields = { to: "maxwell", title, artist: "App Artist", genre: who.genres[0], mix_status: "mastered", release_status: "unsigned", ai_use: "none" };
  const file = wav(3);
  // The same rules as the website: missing details and your own link are refused before any upload.
  expect((await request.post("/api/v1/sends", { headers: auth, data: { ...fields, title: "", fileName: "a.wav", size: file.length } })).status()).toBe(400);
  expect((await request.post("/api/v1/sends", { headers: auth, data: { ...fields, to: `app${stamp}`, fileName: "a.wav", size: file.length } })).status()).toBe(400);

  const start = await request.post("/api/v1/sends", { headers: auth, data: { ...fields, fileName: `${title}.wav`, size: file.length } });
  expect(start.status()).toBe(200);
  const { uploadId, target } = await start.json();
  expect((await request.put(target.url, { headers: target.headers, data: file })).ok()).toBe(true);
  const done = await request.post("/api/v1/sends/complete", { headers: auth, data: { to: "maxwell", uploadId, duration: 3 } });
  expect(done.status()).toBe(200);
  const { token } = await done.json();

  const sent = await (await request.get("/api/v1/sends", { headers: auth })).json();
  expect(sent.sends[0]).toMatchObject({ token, title, handle: "maxwell" });
  expect(sent.sends[0]).not.toHaveProperty("decision");

  // The receiver: it's in the queue; once kept it's in Prepare; collections answer.
  const rx = await (await request.post("/api/v1/auth/login", { data: { email: "demo@floortest.test", password: "floortest-demo" } })).json();
  const rauth = { Authorization: `Bearer ${rx.accessToken}` };
  const track = (await (await request.get("/api/v1/queue", { headers: rauth })).json()).tracks.find((t: { title: string }) => t.title === title);
  expect(track).toBeTruthy();
  expect((await request.post(`/api/v1/tracks/${track.id}/decision`, { headers: rauth, data: { decision: "kept" } })).status()).toBe(200);
  const prep = await (await request.get("/api/v1/prepare", { headers: rauth })).json();
  expect(prep.tracks[0]).toMatchObject({ id: track.id, title });
  const cols = await (await request.get("/api/v1/collections", { headers: rauth })).json();
  expect(cols.collections.length).toBeGreaterThan(0);
  const col = await request.get(`/api/v1/collections/${cols.collections[0].id}`, { headers: rauth });
  expect(col.status()).toBe(200);
  // Someone else's collection is not found.
  expect((await request.get(`/api/v1/collections/${cols.collections[0].id}`, { headers: auth })).status()).toBe(404);
});
