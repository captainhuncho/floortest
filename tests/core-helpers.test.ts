import assert from "node:assert/strict";
import { test } from "node:test";
import { toPositional } from "../src/lib/db/client";
import { cleanGenre, deletesAt, genresFor, listenThreshold } from "../src/lib/plans";
import { parseFilename } from "../src/lib/tags";

test("SQL placeholders become $n, but not inside quoted strings", () => {
  assert.equal(toPositional("select ? , '?' as q, \"a?\" from t where x = ?"), "select $1 , '?' as q, \"a?\" from t where x = $2");
});

test("Listened threshold: 30s, or a quarter of shorter tracks", () => {
  assert.equal(listenThreshold(600), 30);
  assert.equal(listenThreshold(40), 10);
  assert.equal(listenThreshold(null), 30);
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
  assert.deepEqual(parseFilename("Kwame Asante - Tro Tro Rush.wav"), { artist: "Kwame Asante", title: "Tro Tro Rush" });
  assert.deepEqual(parseFilename("final_master_v7.mp3"), { artist: "", title: "final master v7" });
});
