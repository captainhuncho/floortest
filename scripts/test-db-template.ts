// Runs before `npm test` (pretest): builds the migrated database every test file copies (tests/test-db.ts), unless
// the one for the current migrations is already there. Built in a temporary folder and renamed into place when done,
// so a test never copies a half-built template. Test-only: never touches ./data or a real database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { templateDir } from "../tests/test-db";

(async () => {
  const target = templateDir();
  if (fs.existsSync(path.join(target, "ready"))) return;
  const build = fs.mkdtempSync(path.join(os.tmpdir(), "floortest-test-db-build-"));
  process.env.DATA_DIR = build;
  process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
  delete process.env.DATABASE_URL;
  const { getDb } = await import("../src/lib/db/client");
  const db = await getDb(); // opens and migrates
  await db.close();
  fs.writeFileSync(path.join(build, "ready"), new Date().toISOString());
  fs.rmSync(target, { recursive: true, force: true }); // a template left half-built by a stopped run
  fs.renameSync(build, target);
  console.log(`Test database template ready: ${target}`);
})().catch((e) => {
  // The tests still run without it: each file then migrates its own database, as before.
  console.error("Test database template not built; tests will migrate their own databases.", e);
});
