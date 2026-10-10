// Writes the offline screen's start address (same rule as capacitor.config.ts) and the crest straight into
// www/index.html, so the page needs no other files: Android shows it at the site's address, where relative files don't exist.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
const site = (process.env.FLOORTEST_URL ?? "https://floortest.app").replace(/\/$/, "");
const start = `${site}/dashboard/floor`;
const page = new URL("../www/index.html", import.meta.url);
const crest = readFileSync(new URL("../../public/brand/crest.svg", import.meta.url)).toString("base64");
const html = readFileSync(page, "utf8")
  .replace(/<script id="ft-start">.*?<\/script>/, `<script id="ft-start">window.FLOORTEST_START = ${JSON.stringify(start)};</script>`)
  .replace(/<img id="ft-crest" src="[^"]*"/, `<img id="ft-crest" src="data:image/svg+xml;base64,${crest}"`);
writeFileSync(page, html);
rmSync(new URL("../www/start.js", import.meta.url), { force: true });
rmSync(new URL("../www/crest.svg", import.meta.url), { force: true });
console.log(`start: ${start}`);
