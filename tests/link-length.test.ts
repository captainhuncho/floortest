import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_LINK_CHARS, parseLinks, readLinks, requestLink, senderProfiles, slotLink } from "../src/lib/socials";

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

test("a plan request's link is measured as saved: over the limit is refused, never cut", () => {
  assert.deepEqual(requestLink(""), { link: "" }, "the field is optional");
  assert.deepEqual(requestLink(site(MAX_LINK_CHARS)), { link: site(MAX_LINK_CHARS) });
  assert.deepEqual(requestLink(site(MAX_LINK_CHARS + 1)), { error: "long" });
  // https:// is added before measuring: typed 296 characters without it, saved as 304.
  const bare = site(MAX_LINK_CHARS - 4).slice("https://".length);
  assert.equal(bare.length, MAX_LINK_CHARS - 12);
  assert.deepEqual(requestLink(`${bare}abcdefgh`), { error: "long" });
  // Non-ASCII is encoded when saved, so a short-looking link can be long (Safety: 152 typed, 860 saved).
  const accented = `https://imss.com/${"é".repeat(100)}`;
  assert.ok(accented.length < MAX_LINK_CHARS);
  assert.deepEqual(requestLink(accented), { error: "long" });
  assert.deepEqual(requestLink("javascript:alert(1)"), { error: "link" });
  assert.deepEqual(requestLink("imss.com/about"), { link: "https://imss.com/about" });
});

test("requestPlan uses the plan-request link rule and the page explains a long link", () => {
  const action = fs.readFileSync("src/app/dashboard/actions/settings.ts", "utf8");
  const body = action.slice(action.indexOf("export async function requestPlan"), action.indexOf("export async function withdrawPlanRequest"));
  assert.match(body, /requestLink\(/);
  assert.doesNotMatch(body, /\.slice\(0, 300\)/, "the link is not cut at the limit");
  const page = fs.readFileSync("src/app/dashboard/plans/request/page.tsx", "utf8");
  assert.match(page, /long: `That link is over \$\{MAX_LINK_CHARS\} characters/);
  assert.match(page, /name="link" type="url" maxLength=\{LINK_FIELD_CHARS\}/, "a long paste reaches the message");
});
