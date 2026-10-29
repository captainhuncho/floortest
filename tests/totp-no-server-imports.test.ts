import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// The e2e specs import totpCode from src/lib/totp to sign in, outside Next's server. A server-only import there breaks
// every Playwright run ("This module cannot be imported from a Client Component module"); pass secrets in instead.
test("totp.ts stays free of server-only imports, so the e2e specs can load it", () => {
  const src = readFileSync(path.join(__dirname, "..", "src", "lib", "totp.ts"), "utf8");
  const imports = [...src.matchAll(/^import\s.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports.filter((p) => !p.startsWith("node:")), [], "only node: built-ins");
  assert.doesNotMatch(src, /["']server-only["']/);
});
