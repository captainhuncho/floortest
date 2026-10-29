import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "../src/lib/csv";

// Hardening H13 (29 Oct): the users export can't hand a spreadsheet a formula, however the cell starts.
test("cells that a spreadsheet could read as a formula are made plain text", () => {
  for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1", "|cmd", " =1", "\n=1", "  @x", " =1"])
    assert.match(csvCell(v), /^"'/, JSON.stringify(v));
});

test("ordinary cells are quoted and kept as they are", () => {
  assert.equal(csvCell("Kwame"), '"Kwame"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell("a=b"), '"a=b"');
});
