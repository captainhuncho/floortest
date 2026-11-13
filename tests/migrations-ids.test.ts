import { test } from "node:test";
import assert from "node:assert/strict";
import { MIGRATIONS } from "../src/lib/db/migrations";

// Two branches once picked the same migration number (#526 and #529, 13 Nov). Migrations run in array order and are
// recorded by their full id (schema_migrations), so a shared number doesn't skip one, but it hides which came first
// and invites a reorder. CI fails here when a new one clashes (Safety, 13 Nov). Older clashes are already applied in
// production under their ids and must never be renamed (a renamed id would run again); they are listed here and frozen.
const PAST_CLASHES = new Set(["0095_session_devices", "0097_person_rules"]);
const PAST_OUT_OF_ORDER = new Set(["0135_tour_seen"]);

const ids = MIGRATIONS.map((m) => m.id);
const num = (id: string) => id.slice(0, 4);

test("every migration id is NNNN_name", () => {
  for (const id of ids) assert.match(id, /^\d{4}_[a-z0-9_]+$/, id);
});

test("migration ids and their 4-digit numbers are unique", () => {
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  const seen = new Map<string, string>();
  for (const id of ids) {
    if (seen.has(num(id))) assert.ok(PAST_CLASHES.has(id), `${id} and ${seen.get(num(id))} share the number ${num(id)}: take the next free one`);
    else seen.set(num(id), id);
  }
});

test("migrations are in ascending order of their numbers", () => {
  for (let i = 1; i < ids.length; i++) {
    if (PAST_CLASHES.has(ids[i]) || PAST_OUT_OF_ORDER.has(ids[i])) continue;
    assert.ok(num(ids[i]) > num(ids[i - 1]), `${ids[i]} must come after ${ids[i - 1]} with a higher number`);
  }
});

test("the frozen past exceptions are still where they were (never renamed or moved)", () => {
  for (const id of [...PAST_CLASHES, ...PAST_OUT_OF_ORDER]) assert.ok(ids.includes(id), `${id} is still in MIGRATIONS`);
});
