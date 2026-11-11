import { test } from "node:test";
import assert from "node:assert/strict";
import { profileKey, sameProfiles, slotLink, type ProfileLink } from "../src/lib/socials";

const ig = (raw: string) => {
  const r = slotLink("instagram", raw);
  assert.ok(!("error" in r), `${raw}: ${"error" in r ? r.error : ""}`);
  return r as ProfileLink;
};

test("one Instagram profile, however it's written, is the same profile (owner, 11 Nov)", () => {
  const ways = [
    "@imssrecords",
    "imssrecords",
    "instagram.com/imssrecords",
    "instagram.com/imssrecords/",
    "www.instagram.com/imssrecords",
    "www.instagram.com/imssrecords/",
    "https://www.instagram.com/imssrecords/",
    "https://instagram.com/imssrecords",
    "http://m.instagram.com/imssrecords",
    "https://www.instagram.com/imssrecords/?igsh=abc123&utm_source=qr",
    "https://www.instagram.com/IMSSRecords/#top",
  ];
  const keys = new Set(ways.map((w) => profileKey(ig(w))));
  assert.equal(keys.size, 1, [...keys].join(" | "));
  assert.ok(sameProfiles([ig("instagram.com/imssrecords")], [ig("https://www.instagram.com/imssrecords/")]));
  for (const w of ways) assert.equal(ig(w).url, "https://instagram.com/imssrecords", `${w} is saved in one form`);
});

test("different usernames are different profiles: dots, underscores and extra characters count", () => {
  const handles = ["@imssrecords", "@imss_records", "@imss.records", "@imssrecords_", "@imssrecords1"];
  const keys = new Set(handles.map((h) => profileKey(ig(h))));
  assert.equal(keys.size, handles.length, [...keys].join(" | "));
  assert.ok(!sameProfiles([ig("@imssrecords")], [ig("@imss.records")]), "swapping to @imss.records is a change");
});

test("an Instagram username with a dot is accepted with @; a bare dotted name stays a link", () => {
  assert.equal(ig("@imss.records").url, "https://instagram.com/imss.records");
  const bare = slotLink("instagram", "linktr.ee");
  assert.ok("error" in bare, "a website pasted in the Instagram slot is still refused");
});

test("adding, removing or reordering profiles is judged by the profiles, not the text", () => {
  const a = [ig("@imssrecords"), slotLink("soundcloud", "@imss") as ProfileLink];
  const reordered = [slotLink("soundcloud", "https://soundcloud.com/imss/") as ProfileLink, ig("https://www.instagram.com/imssrecords")];
  assert.ok(sameProfiles(a, reordered), "same two profiles in another order and spelling");
  assert.ok(!sameProfiles(a, [ig("@imssrecords")]), "removing one is a change");
  assert.ok(!sameProfiles([ig("@imssrecords")], a), "adding one is a change");
});

test("case still counts where a platform's address is case-sensitive, and websites keep their path and query", () => {
  const spotify = (u: string) => slotLink("spotify", u) as ProfileLink;
  assert.notEqual(profileKey(spotify("https://open.spotify.com/artist/AbC")), profileKey(spotify("https://open.spotify.com/artist/abc")));
  const site = (u: string) => slotLink("website", u) as ProfileLink;
  assert.equal(profileKey(site("https://www.imss.com/about/")), profileKey(site("imss.com/about")));
  assert.notEqual(profileKey(site("imss.com/?page=1")), profileKey(site("imss.com/?page=2")));
});

test("Instagram's own username rules decide what counts as a profile", () => {
  const ok = ["@imssrecords", "@imss_records", "@imss.records", "@imssrecords_", "@_imss", "@imss.records_1", "@a", `@${"a".repeat(30)}`, "instagram.com/imss.records/"];
  for (const h of ok) assert.ok(!("error" in slotLink("instagram", h)), `${h} is a valid username`);
  const bad = [
    "@.imss", // starts with a dot
    "@imss.", // ends with a dot
    "@imss..records", // two dots in a row
    "@imss-records", // hyphens aren't allowed
    `@${"a".repeat(31)}`, // over 30 characters
    "instagram.com/p/Cxyz123", // a post, not a profile
    "instagram.com/reel/Cxyz123",
    "instagram.com/explore",
    "instagram.com/imssrecords/tagged", // a page inside a profile
  ];
  for (const h of bad) assert.ok("error" in slotLink("instagram", h), `${h} is refused`);
});
