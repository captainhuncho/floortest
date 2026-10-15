import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { pwnedCheckOn, timesBreached } from "../src/lib/breached";

const sha = (pw: string) => crypto.createHash("sha1").update(pw).digest("hex").toUpperCase();

/** A stand-in for the Pwned Passwords range API, recording what was asked for. */
function fakeApi(lines: string[], seen: string[] = []) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(String(url));
    assert.equal((init?.headers as Record<string, string>)["Add-Padding"], "true");
    return new Response(lines.join("\r\n"), { status: 200 });
  }) as typeof fetch;
}

test("only the first 5 characters of the hash are sent; a listed password returns its count", async () => {
  const h = sha("hunter2");
  const seen: string[] = [];
  const n = await timesBreached("hunter2", fakeApi(["0000000000000000000000000000000000A:3", `${h.slice(5)}:17043`], seen));
  assert.equal(n, 17043);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].endsWith(`/range/${h.slice(0, 5)}`));
  assert.ok(!seen[0].includes("hunter2") && !seen[0].includes(h.slice(5)));
});

test("an unlisted password, or one matching only a padding line, is 0", async () => {
  const h = sha("a genuinely unusual phrase 8341");
  assert.equal(await timesBreached("a genuinely unusual phrase 8341", fakeApi(["0000000000000000000000000000000000A:3"])), 0);
  assert.equal(await timesBreached("a genuinely unusual phrase 8341", fakeApi([`${h.slice(5)}:0`])), 0);
});

test("a failing or erroring service gives null (the check fails open)", async () => {
  const down = (async () => new Response("", { status: 503 })) as typeof fetch;
  const broken = (async () => { throw new Error("network"); }) as typeof fetch;
  assert.equal(await timesBreached("x", down), null);
  assert.equal(await timesBreached("x", broken), null);
});

test("on for Vercel or PWNED_CHECK=1, off locally and when PWNED_CHECK=0", () => {
  assert.equal(pwnedCheckOn({ VERCEL: "1" }), true);
  assert.equal(pwnedCheckOn({ PWNED_CHECK: "1" }), true);
  assert.equal(pwnedCheckOn({ VERCEL: "1", PWNED_CHECK: "0" }), false);
  assert.equal(pwnedCheckOn({}), false);
});
