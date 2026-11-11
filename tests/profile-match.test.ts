import { test } from "node:test";
import assert from "node:assert/strict";
import { profileKey, readLinks, sameProfiles, senderProfiles, slotLink, type ProfileLink } from "../src/lib/socials";

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

// Safety, PR 510 round 1: a looser profileKey or save rule must fail here. Every input below opens a different page from
// instagram.com/imssrecords, so it's either refused or keeps a key of its own; it must never pass as the real profile.
const REAL = profileKey({ platform: "instagram", url: "https://instagram.com/imssrecords" });
const notTheReal = (raw: string) => {
  const r = slotLink("instagram", raw);
  assert.ok("error" in r || profileKey(r) !== REAL, `${JSON.stringify(raw)} passed as @imssrecords`);
};

test("another host, subdomain, port or sign-in part is never the same Instagram profile", () => {
  for (const raw of [
    "l.instagram.com/imssrecords",
    "evil.instagram.com/imssrecords",
    "instagram.com.evil.io/imssrecords",
    "instagram.com:8443/imssrecords",
    "https://user@instagram.com/imssrecords",
    "https://user:pw@instagram.com/imssrecords",
  ]) {
    notTheReal(raw);
    assert.ok("error" in slotLink("instagram", raw), `${raw} is refused in the Instagram slot`);
  }
  assert.notEqual(profileKey({ platform: "instagram", url: "https://evil.instagram.com/imssrecords" }), REAL);
  assert.notEqual(profileKey({ platform: "instagram", url: "https://l.instagram.com/imssrecords" }), REAL);
  assert.notEqual(profileKey({ platform: "instagram", url: "https://instagram.com:8443/imssrecords" }), REAL);
});

test("look-alike and hidden characters never pass as the real username", () => {
  for (const raw of [
    "instаgram.com/imssrecords", // Cyrillic а in the host
    "instagram.com/imssrеcords", // Cyrillic е in the name
    "instagram.com/imsśrecords", // accented letter
    "instagram.com/imss\u200brecords", // zero-width space in the name
    "instagram.com/imsse\u0301cords", // combining accent
    "instagram.com/imss%72ecords", // %-encoded letter
    "instagram.com/%69mssrecords",
    "@ｉｍｓｓrecords", // full-width letters in the name
    "@imss\u200brecords",
  ]) notTheReal(raw);
  // The browser's own address rules turn a full-width or zero-width host into plain instagram.com: the same page, saved as such.
  for (const raw of ["ｉｎｓｔａｇｒａｍ.com/imssrecords", "insta\u200bgram.com/imssrecords"]) {
    const r = ig(raw);
    assert.equal(r.url, "https://instagram.com/imssrecords");
  }
});

test("short links keep their case, and a query that picks the page keeps it apart", () => {
  const key = (platform: string, url: string) => profileKey(slotLink(platform, url) as ProfileLink);
  assert.notEqual(key("tiktok", "https://vm.tiktok.com/ZMabcDE/"), key("tiktok", "https://vm.tiktok.com/zmabcde"));
  assert.notEqual(key("tiktok", "https://vt.tiktok.com/ZSabcDE/"), key("tiktok", "https://vt.tiktok.com/zsabcde"));
  assert.notEqual(key("soundcloud", "https://on.soundcloud.com/AbCdE"), key("soundcloud", "https://on.soundcloud.com/abcde"));
  assert.notEqual(key("youtube", "https://www.youtube.com/watch?v=AAA"), key("youtube", "https://www.youtube.com/watch?v=BBB"));
  assert.notEqual(key("youtube", "https://youtube.com/playlist?list=PL1"), key("youtube", "https://youtube.com/playlist?list=PL2"));
  assert.notEqual(key("applemusic", "https://music.apple.com/gb/album/x/1?i=5"), key("applemusic", "https://music.apple.com/gb/album/x/1?i=6"));
  // Usernames on the main host still ignore case, and tracking parameters still go.
  assert.equal(key("tiktok", "https://www.tiktok.com/@IMSS?is_from_webapp=1"), key("tiktok", "@imss"));
  assert.equal(key("soundcloud", "https://soundcloud.com/IMSS/"), key("soundcloud", "@imss"));
  assert.equal(key("youtube", "https://www.youtube.com/watch?v=AAA&feature=share&si=x"), key("youtube", "https://youtube.com/watch?v=AAA"));
  assert.equal((slotLink("tiktok", "https://vm.tiktok.com/ZMabcDE/?utm_source=x") as ProfileLink).url, "https://vm.tiktok.com/ZMabcDE");
});

test("a port is refused on every known platform, for receivers and senders alike", () => {
  assert.ok("error" in slotLink("spotify", "https://open.spotify.com:444/artist/x"));
  assert.ok("error" in senderProfiles("", "https://open.spotify.com:444/artist/x"));
  assert.ok(!("error" in slotLink("website", "https://imss.com:8080/")), "a website may use a port");
});

test("links already saved are shown exactly as they were saved", () => {
  const stored = [
    { platform: "tiktok", url: "https://vm.tiktok.com/ZMeAbCd/" },
    { platform: "soundcloud", url: "https://on.soundcloud.com/AbCdE" },
    { platform: "youtube", url: "https://youtube.com/watch?v=AAAA" },
    { platform: "instagram", url: "https://www.instagram.com/IMSSRecords/?igsh=abc" },
  ];
  assert.deepEqual(readLinks(JSON.stringify(stored)), stored);
  // ...and still count as the same profile as the tidy form, so re-saving them keeps the mark.
  assert.ok(sameProfiles(readLinks(JSON.stringify(stored)), stored.map((l) => slotLink(l.platform, l.url) as ProfileLink)));
});
