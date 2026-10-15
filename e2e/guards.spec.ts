import { expect, test } from "./fixtures";

/** Security behaviour a visitor can see from outside, checked in a real browser. */

test("sign-up never says whether an email already has an account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill("E2E-INVITE");
  await page.getByLabel("What best describes you?").selectOption("dj");
  await page.getByLabel("First name").fill("Someone");
  await page.getByLabel("Surname").fill("Else");
  await page.getByLabel("Username").fill(`taken${Date.now().toString(36)}`);
  await page.getByLabel("Email").fill("demo@floortest.test"); // the seeded receiver's email
  await page.getByRole("textbox", { name: "Password" }).fill("Correct-Horse-Battery-77");
  await page.getByRole("checkbox", { name: /18 or over/ }).check();
  await page.getByRole("button", { name: "Create my link" }).click();
  const message = page.getByRole("alert").filter({ hasText: /\S/ }).first();
  await expect(message).toContainText("We couldn't create an account with those details");
  await expect(message).not.toContainText(/exists|already registered/i);
});

test("the on-page site editor refuses anyone without a live ops session", async ({ request }) => {
  const save = await request.post("/api/site-edit", { data: { page: "home", values: { headline: "Hacked" }, publish: true } });
  expect(save.status()).toBe(403);
  const upload = await request.post("/api/site-edit/image", { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
  expect(upload.status()).toBe(403);
});

test("visitors never get editing markup on public pages", async ({ page }) => {
  for (const path of ["/", "/pricing", "/maxwell", "/login"]) {
    await page.goto(path);
    await expect(page.locator("[data-edit], [data-edit-panel], [data-site-editor-ui]")).toHaveCount(0);
  }
});

test("the public link shows the open callout's brief in the same order and wording as the desk", async ({ page }) => {
  await page.goto("/maxwell");
  const brief = page.getByRole("region", { name: "What they're looking for" });
  await expect(brief).toContainText("BPM");
  await expect(brief).toContainText("118–130");
  await expect(brief).toContainText(/Deadline\s*Open until/);
  await expect(brief).toContainText("“Percussive, warm and built for late-night rooms”");
});

test("offline saving: signed-in only, and each download link works for its own track and nothing else", async ({ page }) => {
  expect((await page.request.get("/api/offline/list")).status()).toBe(401);
  expect((await page.request.get("/api/offline/file/1.1.9999999999999.forged")).status()).toBe(403);

  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
  const list = await (await page.request.get("/api/offline/list")).json();
  expect(list.tracks.length).toBeGreaterThan(0);
  const first = list.tracks[0];
  const file = await page.request.get(first.url);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toMatch(/^audio\//);
  // Pointing a link at another track breaks its signature.
  const [, , ...rest] = new URL(first.url).pathname.split("/").pop()!.split(".");
  expect((await page.request.get(`/api/offline/file/${first.id + 1}.${list.owner}.${rest.join(".")}`)).status()).toBe(403);
});

test("after 3 wrong passwords, log-in asks for the human check, and the server enforces it", async ({ page }) => {
  const ghost = `nobody+${Date.now().toString(36)}@example.test`;
  await page.goto("/login");
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Email").fill(ghost);
    await page.getByRole("textbox", { name: "Password" }).fill("wrong-password-123");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toContainText("Email or password is incorrect");
  }
  // The check appears.
  await expect(page.getByTestId("turnstile")).toHaveCount(1);

  // A fresh page has no check on it: even the right password is refused until the check is passed.
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toContainText("Confirm you're human");

  // The check appears on that page too; with it passed, the same log-in goes through.
  await expect(page.getByTestId("turnstile")).toHaveCount(1);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//, { timeout: 20_000 });
});

test("the newsletter sign-up runs the bot check, then sends the confirmation", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("form").filter({ has: page.getByLabel("Email for the newsletter") }).locator("visible=true").first();
  await form.getByLabel("Email for the newsletter").fill(`news+${Date.now().toString(36)}@example.test`);
  // The check loads once someone starts using the form.
  await form.getByTestId("turnstile").waitFor({ state: "attached" });
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText("Check your inbox: we've sent a link to confirm your sign-up.")).toBeVisible();
});

test("a newsletter sign-up without the bot check is refused", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/");
  const form = page.locator("form").filter({ has: page.getByLabel("Email for the newsletter") }).locator("visible=true").first();
  await form.getByLabel("Email for the newsletter").fill(`bot+${Date.now().toString(36)}@example.test`);
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByRole("alert")).toContainText("couldn't confirm you're human");
});

test("the sender-link form runs the bot check, then answers the same for any address", async ({ page }) => {
  await page.goto("/sent");
  const form = page.locator("form").filter({ has: page.getByLabel("Your email") });
  await form.getByLabel("Your email").fill(`nobody+${Date.now().toString(36)}@example.test`);
  await form.getByTestId("turnstile").waitFor({ state: "attached" });
  await form.getByRole("button", { name: "Email me my link" }).click();
  await expect(page.getByRole("status")).toContainText("a link is on its way");
});

test("a sender-link request without the bot check is refused", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/sent");
  const form = page.locator("form").filter({ has: page.getByLabel("Your email") });
  await form.getByLabel("Your email").fill(`bot+${Date.now().toString(36)}@example.test`);
  await form.getByRole("button", { name: "Email me my link" }).click();
  await expect(form.getByRole("alert")).toContainText("couldn't confirm you're human");
});
