import { test } from "node:test";
import assert from "node:assert/strict";

test("the footer's Follow group links to FloorTest's Instagram, @floortest.app", async () => {
  const { footerGroups } = await import("../src/lib/site");
  const follow = footerGroups().find((g) => g.title === "Follow");
  const instagram = follow?.links.find((l) => l.label === "Instagram");
  assert.equal(instagram?.href, "https://www.instagram.com/floortest.app/");
  assert.equal(instagram?.external, true);
});
