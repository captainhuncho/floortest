import assert from "node:assert/strict";
import { test } from "node:test";
import { toPositional } from "../src/lib/db/client";
import { cleanGenre, deletesAt, genresFor, listenThreshold, unheardAfterWindow } from "../src/lib/plans";
import { parseFilename } from "../src/lib/tags";

test("SQL placeholders become $n, but not inside quoted strings", () => {
  assert.equal(toPositional("select ? , '?' as q, \"a?\" from t where x = ?"), "select $1 , '?' as q, \"a?\" from t where x = $2");
});

test("SQL placeholder conversion preserves explicit nullable parameter types", () => {
  assert.equal(
    toPositional("select ? where ? is null or ?::double precision is null or abs(duration - ?) < 0.5"),
    "select $1 where $2 is null or $3::double precision is null or abs(duration - $4) < 0.5",
  );
});

test("Listened threshold: 30s, or a quarter of shorter tracks", () => {
  assert.equal(listenThreshold(600), 30);
  assert.equal(listenThreshold(40), 10);
  assert.equal(listenThreshold(null), 30);
});

test("the receipt's unheard state depends on time since delivery, never on when the file was deleted", () => {
  const day = 86_400_000;
  // A "Not for me" file is gone by day 31; the receipt must not change until the 90-day window every file shares.
  assert.equal(unheardAfterWindow({ played_at: null, created_at: 0 }, 31 * day), false);
  assert.equal(unheardAfterWindow({ played_at: null, created_at: 0 }, 90 * day), true);
  assert.equal(unheardAfterWindow({ played_at: day, created_at: 0 }, 120 * day), false);
});

test("retention dates follow the published policy", () => {
  const day = 86_400_000;
  assert.equal(deletesAt({ decision: "kept", decided_at: 1, created_at: 0 }), null);
  assert.equal(deletesAt({ decision: null, decided_at: null, created_at: 0 }), 90 * day);
  assert.equal(deletesAt({ decision: "passed", decided_at: day, created_at: 0 }), 31 * day);
});

test("genres: custom list or defaults, cleaned input", () => {
  assert.equal(genresFor({ genres: "" }).custom, false);
  assert.deepEqual(genresFor({ genres: '["Afro House"]' }).list, ["Afro House"]);
  assert.equal(cleanGenre("  Deep   House  "), "Deep House");
  assert.equal(cleanGenre("x".repeat(80)).length, 40);
});

test("Artist - Title filenames are split", () => {
  const split = parseFilename("Kwame Asante - Tro Tro Rush.wav");
  assert.equal(split.artist, "Kwame Asante");
  assert.equal(split.title, "Tro Tro Rush");
  const plain = parseFilename("final_master_v7.mp3");
  assert.equal(plain.artist, "");
  assert.equal(plain.title, "final master v7");
});

test("filename parsing returns the full tag set, empty where a name says nothing", () => {
  // Same shape as tags read from the file, so the upload form can merge the two without special cases.
  assert.deepEqual(parseFilename("Kwame Asante - Tro Tro Rush.wav"), { album: "", bpm: null, key: "", isrc: "", trackNo: null, artist: "Kwame Asante", title: "Tro Tro Rush" });
});
