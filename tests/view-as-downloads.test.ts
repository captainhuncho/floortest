import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// Read-only ops "view as" reaches /api only if its cookie path ever widens; every API route that records Downloaded
// (and so emails the sender) refuses it itself rather than relying on that path.
test("every API route that marks a track Downloaded refuses a read-only view-as", () => {
  const root = path.join(import.meta.dirname, "..");
  const routes = files(path.join(root, "src/app/api")).filter((f) => /markDownloaded\(/.test(fs.readFileSync(f, "utf8")));
  assert.ok(routes.length >= 2, "the single download and the crate export");
  const missing = routes.filter((f) => !/if \(await viewingAs\(\)\) return /.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(missing.map((f) => path.relative(root, f)), []);
});
