import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APP_URL = "http://localhost";
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

// Hardening H20 (29 Oct): another site can't link someone to "log in to accept" and plant its own invite for after sign-in.
const invite = "Ab3_-xYz0123456789abcdEF";
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;
const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split("=")[0]);

test("the invite login link remembers the invite only when opened from FloorTest", async () => {
  const { GET } = await import("../src/app/join/[token]/login/route");
  const req = (site: string) => new Request(`http://localhost/join/${invite}/login`, { headers: { "sec-fetch-site": site } });
  assert.deepEqual(cookies(await GET(req("same-origin"), ctx({ token: invite }))).sort(), ["floortest_next", "ft_team_invite"]);
  const cross = await GET(req("cross-site"), ctx({ token: invite }));
  assert.deepEqual(cookies(cross), [], "a link on another site sets nothing");
  assert.match(cross.headers.get("location") ?? "", /\/login$/, "but still goes to sign-in");
});

test("the shared-collection login link remembers the collection only when opened from FloorTest", async () => {
  const { GET } = await import("../src/app/c/[token]/login/route");
  const req = (site: string) => new Request("http://localhost/c/a.12/login", { headers: { "sec-fetch-site": site } });
  assert.deepEqual(cookies(await GET(req("same-origin"), ctx({ token: "a.12" }))), ["floortest_next"]);
  assert.deepEqual(cookies(await GET(req("cross-site"), ctx({ token: "a.12" }))), []);
  assert.deepEqual(cookies(await GET(req("same-site"), ctx({ token: "a.12" }))), [], "a sibling subdomain neither");
});
