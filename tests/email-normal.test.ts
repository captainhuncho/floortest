import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("one rule for emails: compatibility forms folded (NFKC), trimmed, lowercased", async () => {
  const { normalEmail } = await import("../src/lib/email-normal");
  assert.equal(normalEmail("  Ｊｏｅ@Example.COM "), "joe@example.com", "full-width letters fold to plain ones");
  assert.equal(normalEmail("Kate@x.io"), "kate@x.io", "the Kelvin sign is a K");
  assert.equal(normalEmail(normalEmail("Ａ@B.io")), normalEmail("Ａ@B.io"), "applying it twice changes nothing");
});

test("no email typed into a form is lowercased by hand any more", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(new URL("../src", import.meta.url).pathname);
  const hand = /get\("(email|claimant_email)"\)[^;\n]*\.toLowerCase\(\)|\b(email|e|who\.email)\.trim\(\)\.toLowerCase\(\)|fromForm\(form, "email", 200\)\.toLowerCase\(\)/;
  // resolveInvite and requestEmailChange lowercase again what they're given; their callers pass normalEmail values.
  const left = files.filter((f) => !/lib\/(invites|accounts)\.ts$/.test(f)).filter((f) => hand.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(left.map((f) => path.relative(process.cwd(), f)), []);
});
