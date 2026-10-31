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
