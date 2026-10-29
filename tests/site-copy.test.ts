import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSizes, sizesString } from "../src/lib/text-size";
import { cleanField, pairs, rows, sizeableKeys, SITE_PAGES } from "../src/lib/content-fields";

test("text sizes: only the fixed steps are accepted, anything else is dropped", () => {
  assert.deepEqual(parseSizes("headline:lg,intro:sm,faq:xl"), { headline: "lg", intro: "sm", faq: "xl" });
  // Unknown steps, free CSS, extra parts, empty keys and junk all go.
  assert.deepEqual(parseSizes("headline:huge,intro:99px,faq:font-size:3rem,:lg,lg,,  ,x:LG,y:md"), {});
  assert.deepEqual(parseSizes("a:lg;color:red,b:sm"), { b: "sm" });
  assert.deepEqual(parseSizes(null), {});
  // The first entry for a field wins; fields outside the allow-list are dropped.
  assert.deepEqual(parseSizes("headline:lg,headline:sm,sections:xl", ["headline"]), { headline: "lg" });
  assert.equal(sizesString(parseSizes(" headline : lg , intro:sm ")), "headline:lg,intro:sm");
});

test("site copy: new fields start with the wording the page had", () => {
  const home = SITE_PAGES.home.fields;
  assert.equal(home.deck_title.start, "Cued up like a deck.");
  assert.equal(home.log_title.start, "Sent during the week. Played during the weekend.");
  assert.equal(home.desk_title.start, "Two sides of one desk.");
  assert.equal(home.waitlist_title.start, "No invite yet?");
  assert.equal(home.waitlist_intro.start, "Invites go out a few at a time. Leave your details and we'll email yours.");
  assert.equal(home.footer_note.start, "Private beta. Web · iPhone and Android soon.");
  assert.deepEqual(pairs(home.deck_readouts.start), [["Order", "Oldest first"], ["Listened", "30 s"], ["Keep", "→ crate"]]);
  assert.deepEqual(pairs(home.journey_steps.start).map(([t]) => t), ["Delivered", "Listened", "Downloaded", "Replied"]);
  assert.equal(pairs(home.private_points.start).length, 3);
  assert.deepEqual(rows(home.log_rows.start), [
    ["Tue 18:00", "Callout open", null, "Reads your brief"],
    ["Wed 21:40", "Lands in Up next", null, "Delivered"],
    ["Thu 00:12", "30 seconds in", "Real playback only", "Listened"],
    ["Thu 00:13", "Keep", null, null],
    ["Sat 19:30", "Into the crate", "Rekordbox XML and M3U8", "Downloaded"],
    ["Sun 01:12", "On the floor", null, "Played out"],
  ]);
  assert.equal(SITE_PAGES.auth.fields.login_intro.start, "Sign in to your music desk.");
  assert.equal(SITE_PAGES.pricing.fields.pricing_back.start, "← Back to home");
  assert.equal(SITE_PAGES.receipt.fields.history_title.start, "What's happened");
  assert.equal(SITE_PAGES.link.fields.receiving_for.start, "Receiving for");
  // Every page starts with no sizes, so nothing changes until someone picks one.
  for (const p of Object.values(SITE_PAGES)) assert.equal((p.fields as Record<string, { start: string }>).sizes.start, "");
  assert.ok(sizeableKeys("home").includes("headline"));
  assert.ok(!sizeableKeys("home").includes("sections") && !sizeableKeys("home").includes("preview_image") && !sizeableKeys("home").includes("sizes"));
});

test("site edit: a saved sizes field keeps only this page's text fields at the fixed steps", () => {
  // The same cleaning runs for the on-page editor (/api/site-edit) and the ops form (writeContent).
  const fld = SITE_PAGES.home.fields.sizes;
  assert.equal(cleanField("home", "sizes", fld, "headline:xl,faq:sm,sections:lg,preview_image:lg,login_title:lg,intro:200%,eyebrow:lg;color:red,<b>:lg"), "headline:xl,faq:sm");
  assert.equal(cleanField("home", "sizes", fld, "nonsense"), "");
  assert.equal(cleanField("home", "sizes", fld, ["headline:lg"]), "headline:lg");
  assert.equal(cleanField("auth", "sizes", SITE_PAGES.auth.fields.sizes, "login_title:sm,headline:lg"), "login_title:sm");
  // An empty text field falls back to its starting wording, as before.
  assert.equal(cleanField("home", "deck_title", SITE_PAGES.home.fields.deck_title, "  "), "Cued up like a deck.");
});
