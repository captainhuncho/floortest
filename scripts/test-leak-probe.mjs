// npm run test:leaks: the unit tests with this file preloaded. `npm test` ends each test file's process once its tests are
// done (--test-force-exit), which would also hide a timer or connection our own code leaves open. At each file's exit
// this lists what would still have held the process: timers and sockets with a reference, apart from PGlite's own
// 10-second Postgres timer and the test runner's.
// Expected today (1 Nov), all test scaffolding, none from src/lib: the fake servers the scanner, scanner-health and
// held-uploads tests start and don't close, and the AWS SDK request and retry timers in r2-timeouts and storage-errors,
// whose fake storage hangs on purpose. Anything else is new: find where it is opened and close or unref it.
import { createHook } from "node:async_hooks";
import { writeSync } from "node:fs";

const live = new Map();
createHook({
  init(id, type, _trigger, resource) {
    if (type !== "Timeout" && type !== "TCPWRAP" && type !== "TCPSERVERWRAP") return;
    live.set(id, { resource, where: `${type} ${new Error().stack.split("\n").slice(3, 14).map((l) => l.trim()).join(" | ")}` });
  },
  destroy(id) {
    live.delete(id);
  },
}).enable();

process.on("exit", () => {
  const held = [...live.values()].filter(
    ({ resource, where }) => (typeof resource?.hasRef !== "function" || resource.hasRef()) && !where.includes("@electric-sql/pglite") && !where.includes("test_runner"),
  );
  const file = process.argv.find((a) => a.endsWith(".test.ts"));
  if (held.length) writeSync(2, `\nStill open at exit in ${file}:\n  ${held.map((h) => h.where.slice(0, 900)).join("\n  ")}\n`);
});
