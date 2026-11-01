import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIGRATIONS } from "../src/lib/db/migrations";

/**
 * Throwaway databases for the unit tests (1 Nov). Each database test file used to start empty and run every migration
 * itself (about 120), which was most of its time. `npm test` now migrates one template first
 * (scripts/test-db-template.ts) and each file starts from a copy of it. The template's folder is named after the
 * migrations it holds, so adding or changing a migration builds a new one; a file run on its own without the template
 * starts empty and migrates as before.
 */
export function templateDir() {
  const hash = crypto.createHash("sha256").update(MIGRATIONS.map((m) => `${m.id}\n${m.sql}`).join("\n\n")).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `floortest-test-db-${hash}`);
}

/** A fresh database folder for one test file: a copy of the migrated template when there is one, else empty. */
export function testDataDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const template = templateDir();
  if (fs.existsSync(path.join(template, "ready"))) fs.cpSync(path.join(template, "pg"), path.join(dir, "pg"), { recursive: true });
  return dir;
}
