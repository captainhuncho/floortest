import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSizes, sizesString } from "../src/lib/text-size";
import { cells, cleanField, messages, pairs, sectionOrder, sizeableKeys, SITE_PAGES } from "../src/lib/content-fields";

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
  assert.equal(home.sun_title.start, "One link. Point it anywhere.");
  assert.equal(home.sat_title.start, "You play it.");
  assert.equal(home.end_title.start, "Your link is waiting.");
  assert.equal(home.waitlist_title.start, "No invite yet?");
  assert.equal(home.waitlist_intro.start, "Invites go out a few at a time. Leave your details and we'll email yours.");
  assert.equal(home.footer_note.start, "Private beta. Web · iPhone and Android soon.");
  assert.deepEqual(pairs(home.journey_steps.start).map(([t]) => t), ["Delivered", "Listened", "Downloaded", "Replied"]);
  assert.equal(pairs(home.private_points.start).length, 3);
  // The home's lists: 11 loop messages (four in mono), two routes, four receipt steps, three points for senders.
  assert.equal(messages(home.loop_messages.start).length, 11);
  assert.deepEqual(messages(home.loop_messages.start).filter((m) => m.mono).map((m) => m.text), ["did you get my track?", "new_mix_v3_master.wav", "Download limit reached", "which version was the final?"]);
  assert.deepEqual(cells(home.route_rows.start), [["Yesterday", "Friday residency"], ["Today", "Radio show callout"]]);
  assert.deepEqual(cells(home.receipt_steps.start).map(([t]) => t), ["Delivered", "Listened", "Downloaded", "Played out"]);
  assert.equal(pairs(home.fair_points.start).length, 3);
  // 1E has no deck, set log or two-sides sections, and a saved order that names them drops them.
  assert.deepEqual(sectionOrder("deck,log,desk,private,plans,waitlist,faq,-journey,-how,-preview").map((x) => x.id).slice(0, 4), ["week", "booth", "receipt", "fair"]);
  assert.ok(!("deck_title" in home) && !("log_rows" in home) && !("desk_title" in home));
  assert.equal(SITE_PAGES.auth.fields.login_intro.start, "", "log in shows no intro line unless one is saved");
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
  assert.equal(cleanField("home", "sun_title", SITE_PAGES.home.fields.sun_title, "  "), "One link. Point it anywhere.");
});
