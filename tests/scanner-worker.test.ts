import { test } from "node:test";
import assert from "node:assert/strict";
import { refusal } from "../scanner/cloudflare/routes.js";

// The scanner's address is in this public repository, so every route that wakes the container (and so costs money while
// it runs) needs the secret. Only /status stays open: it reads the stored state and never wakes it (owner, 28 Oct).
const env = { SCAN_SECRET: "s".repeat(32) };
const ask = (method: string, path: string, auth?: string) =>
  refusal(`${method} ${path}`, new Request(`https://scanner.example${path}`, { method, headers: auth ? { Authorization: auth } : {} }), env);

test("every route that wakes the scanner refuses a caller without the secret", async () => {
  for (const [method, path] of [["GET", "/health"], ["POST", "/wake"], ["POST", "/scan"]]) {
    assert.equal((await ask(method, path))?.status, 401, `${method} ${path} with no secret`);
    assert.equal((await ask(method, path, "Bearer wrong"))?.status, 401, `${method} ${path} with a wrong secret`);
    assert.equal((await ask(method, path, `Bearer ${env.SCAN_SECRET}x`))?.status, 401, `${method} ${path} with a longer secret`);
    assert.equal(await ask(method, path, `Bearer ${env.SCAN_SECRET}`), null, `${method} ${path} with the secret`);
  }
});

test("/status stays open, unknown routes are not found, and an unset secret lets nobody in", async () => {
  assert.equal(await ask("GET", "/status"), null);
  assert.equal((await ask("GET", "/admin"))?.status, 404);
  assert.equal((await ask("POST", "/health", `Bearer ${env.SCAN_SECRET}`))?.status, 404);
  const none = await refusal("GET /health", new Request("https://scanner.example/health", { headers: { Authorization: "Bearer " } }), {});
  assert.equal(none?.status, 401);
});
