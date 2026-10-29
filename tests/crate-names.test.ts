import { test } from "node:test";
import assert from "node:assert/strict";
import { cratePath, safeName } from "../src/lib/rekordbox";

// Hardening H10 (29 Oct): a title of "." or ".." must not become a path step in the crate ZIP or the Rekordbox file.
test("a name made only of dots becomes Untitled, so it can't step up a folder", () => {
  for (const s of [".", "..", "...", " .. ", "./..", "/../"]) assert.equal(safeName(s), "Untitled", JSON.stringify(s));
  assert.equal(safeName("..Intro"), "..Intro", "dots with other text are a normal name");
  assert.equal(safeName("Vol. 2"), "Vol. 2");
});

test("a release folder called .. stays inside the crate", () => {
  const t = { id: 7, artist: "A", title: "B", mime: "audio/mpeg", release_folder: "..", track_no: 1 } as Parameters<typeof cratePath>[0];
  assert.equal(cratePath(t), "Untitled/01 A - B [7].mp3");
});
