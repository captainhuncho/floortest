import { test } from "node:test";
import assert from "node:assert/strict";
import { toPositional } from "../src/lib/db/client";

// Hardening H09 (29 Oct): `?` is only a placeholder outside strings, quoted names, comments and dollar quotes;
// anything else would shift every later parameter by one without an error.
test("placeholders are numbered in order, skipping ? inside strings and quoted names", () => {
  assert.equal(toPositional("SELECT ?, '?', \"a?\" FROM t WHERE x = ?"), "SELECT $1, '?', \"a?\" FROM t WHERE x = $2");
  assert.equal(toPositional("SELECT 'it''s ?', ?"), "SELECT 'it''s ?', $1", "a doubled quote stays inside the string");
});

test("comments never hold a placeholder", () => {
  assert.equal(toPositional("-- don't ask?\nSELECT ?"), "-- don't ask?\nSELECT $1");
  assert.equal(toPositional("SELECT /* why? it's */ ?"), "SELECT /* why? it's */ $1");
  assert.equal(toPositional("SELECT /* a /* nested? */ ' */ ?"), "SELECT /* a /* nested? */ ' */ $1", "Postgres comments nest");
  assert.equal(toPositional("SELECT 1 - -1, ?"), "SELECT 1 - -1, $1");
});

test("E'' strings with backslash escapes and dollar quotes are skipped whole", () => {
  assert.equal(toPositional("SELECT E'\\'', ?"), "SELECT E'\\'', $1");
  assert.equal(toPositional("SELECT e'a\\\\', ?"), "SELECT e'a\\\\', $1");
  assert.equal(toPositional("SELECT $$ a ? $$, ?"), "SELECT $$ a ? $$, $1");
  assert.equal(toPositional("SELECT $q$ it's ? $q$, ?"), "SELECT $q$ it's ? $q$, $1");
  assert.equal(toPositional("SELECT a$b, ? FROM t WHERE x = ?"), "SELECT a$b, $1 FROM t WHERE x = $2", "a $ inside a name is not a quote");
});
