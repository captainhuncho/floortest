import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LEGAL } from "../src/lib/legal";

// Hardening H34 (29 Oct): a deploy from a working folder never uploads a .env file.
test(".vercelignore leaves out every .env file except the example", () => {
  const lines = fs.readFileSync(".vercelignore", "utf8").split("\n").map((l) => l.trim());
  assert.ok(lines.includes(".env*"), ".env*");
  assert.ok(lines.includes("!.env.example"), "!.env.example");
});

// Hardening H72 (29 Oct): security reports go to the address the site advertises.
test("security.txt names the security contact the site shows", () => {
  const txt = fs.readFileSync("public/.well-known/security.txt", "utf8");
  const contacts = [...txt.matchAll(/^Contact:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(contacts, [`mailto:${LEGAL.security}`]);
});
