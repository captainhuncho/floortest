import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LINK_CHARS, parseLinks, readLinks, senderProfiles, slotLink } from "../src/lib/socials";

// A link over the limit is refused with a message, never cut short: a cut link can open another page (Safety, PR 510).
const site = (chars: number) => `https://imss.com/${"a".repeat(chars - "https://imss.com/".length)}`;

test("a website link of exactly the limit saves whole; one character more is refused", () => {
  assert.deepEqual(slotLink("website", site(MAX_LINK_CHARS)), { platform: "website", url: site(MAX_LINK_CHARS) });
  const r = slotLink("website", site(MAX_LINK_CHARS + 1));
  assert.ok("error" in r && r.error.includes(`${MAX_LINK_CHARS} characters`), JSON.stringify(r));
});

test("the limit is measured after tidying, so tracking parameters don't push a profile over", () => {
  const long = `https://www.instagram.com/imssrecords/?igsh=${"x".repeat(400)}`;
  assert.deepEqual(slotLink("instagram", long), { platform: "instagram", url: "https://instagram.com/imssrecords" });
  const page = `https://www.youtube.com/watch?v=${"A".repeat(MAX_LINK_CHARS)}`;
  assert.ok("error" in slotLink("youtube", page), "a page-picking query is kept, so it can run over");
});

test("senders' streaming profile and pasted lists are refused too, not cut", () => {
  const r = senderProfiles("", `https://open.spotify.com/artist/${"b".repeat(MAX_LINK_CHARS)}`);
  assert.ok("error" in r && r.error.startsWith("Streaming profile:"), JSON.stringify(r));
  assert.ok(parseLinks(site(MAX_LINK_CHARS + 1)).error);
  assert.equal(parseLinks(site(MAX_LINK_CHARS)).error, undefined);
});

test("saved links are shown exactly as stored", () => {
  const stored = [{ platform: "website", url: site(MAX_LINK_CHARS) }];
  assert.deepEqual(readLinks(JSON.stringify(stored)), stored);
});
