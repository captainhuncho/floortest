// Writes www/start.js with the address the app opens (same rule as capacitor.config.ts), so the offline
// screen's "Try again" goes back to FloorTest rather than reloading itself.
import { writeFileSync } from "node:fs";
const site = (process.env.FLOORTEST_URL ?? "https://floortest.app").replace(/\/$/, "");
writeFileSync(new URL("../www/start.js", import.meta.url), `window.FLOORTEST_START = ${JSON.stringify(`${site}/dashboard/floor`)};\n`);
console.log(`start: ${site}/dashboard/floor`);
