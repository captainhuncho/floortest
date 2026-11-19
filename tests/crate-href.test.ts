import { test } from "node:test";
import assert from "node:assert/strict";
import { CRATE_KINDS, crateHref, crateReady } from "../src/lib/crate-href";

const params = (href: string) => {
  const u = new URL(href, "https://floortest.app");
  assert.equal(u.pathname, "/api/export");
  return Object.fromEntries(u.searchParams);
};

test("Download crate offers the three choices, playlist first", () => {
  assert.deepEqual(CRATE_KINDS.map((k) => k.kind), ["playlist", "rekordbox", "files"]);
});

test("Tracks + playlist asks the export for the named folder and nothing else", () => {
  assert.deepEqual(params(crateHref("playlist", "  Friday set ", "/Users/me/Music")), { name: "Friday set" });
});

test("Tracks + Rekordbox playlist adds where the folder will be unzipped", () => {
  assert.deepEqual(params(crateHref("rekordbox", "Friday set", " /Users/me/Music ")), { name: "Friday set", base: "/Users/me/Music" });
});

test("Files only asks for files=1 and never sends a Rekordbox folder", () => {
  assert.deepEqual(params(crateHref("files", "Friday set", "/Users/me/Music")), { name: "Friday set", files: "1" });
});

test("a download needs a folder name, and Rekordbox needs its music folder", () => {
  assert.equal(crateReady("playlist", " "), false);
  assert.equal(crateReady("playlist", "Friday set"), true);
  assert.equal(crateReady("files", "Friday set"), true);
  assert.equal(crateReady("rekordbox", "Friday set", " "), false);
  assert.equal(crateReady("rekordbox", "Friday set", "/Users/me/Music"), true);
});
