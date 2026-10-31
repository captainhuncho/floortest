import { test } from "node:test";
import assert from "node:assert/strict";
import { fillFromFile, parseFilename } from "../src/lib/tags";

const initial = parseFilename("My Track.wav");

test("a late tag read fills the fields the sender left alone", () => {
  const read = { ...initial, artist: "Tagged Artist", bpm: 124, key: "8A" };
  assert.deepEqual(fillFromFile(initial, initial, read), read);
});

test("a late tag read keeps what the sender typed meanwhile", () => {
  const typed = { ...initial, title: "Typed Title", artist: "Typed Artist" };
  const read = { ...initial, title: "Tagged Title", artist: "", key: "8A" };
  assert.deepEqual(fillFromFile(typed, initial, read), { ...initial, title: "Typed Title", artist: "Typed Artist", key: "8A" });
});

test("an untagged file read late doesn't empty a typed artist", () => {
  const typed = { ...initial, artist: "E2E Artist" };
  assert.equal(fillFromFile(typed, initial, parseFilename("My Track.wav")).artist, "E2E Artist");
});

test("owner upload: a late tag read keeps a typed artist and fills the untouched title", () => {
  // OwnerUpload starts each item as { title: file name without extension, artist: "" } and fills only those two.
  const read = { ...parseFilename("Tagged Artist - Tagged Title.wav") };
  const start = { ...read, title: "Tagged Artist - Tagged Title", artist: "" };
  const typed = { ...start, artist: "Owner Typed" };
  const filled = fillFromFile(typed, start, read);
  assert.equal(filled.artist, "Owner Typed");
  assert.equal(filled.title, "Tagged Title");
});
