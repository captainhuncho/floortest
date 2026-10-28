import { test } from "node:test";
import assert from "node:assert/strict";
import { httpsLink, localPath } from "../src/lib/safe-links";
import { parseLink, parseLinks, readLinks, slotLink } from "../src/lib/socials";

// Rule 4 (audit 27 Oct): links people type never become javascript: or data: addresses on our pages.
const BAD = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  " javascript:alert(document.cookie)",
  "java\tscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
];

test("profile links (receivers' and senders') refuse javascript: and data:", () => {
  for (const raw of BAD) {
    assert.ok("error" in parseLink(raw), raw);
    assert.ok("error" in slotLink("instagram", raw), `instagram slot: ${raw}`);
    assert.ok("error" in slotLink("website", raw), `website slot: ${raw}`);
  }
  assert.ok(parseLinks(BAD.join("\n")).error, "a pasted list stops at the first bad one");
  // Saved links are re-checked on the way out, so an old bad row never renders.
  assert.deepEqual(readLinks(JSON.stringify(BAD.map((url) => ({ platform: "website", url })))), []);
  // Good links still work and always come out as https.
  assert.deepEqual(parseLink("http://instagram.com/maxwell"), { platform: "instagram", url: "https://instagram.com/maxwell" });
  assert.deepEqual(slotLink("instagram", "@maxwell"), { platform: "instagram", url: "https://instagram.com/maxwell" });
});

test("announcement links stay on FloorTest", () => {
  for (const raw of [...BAD, "https://evil.example/x", "//evil.example", "/\\evil.example", "\\\\evil.example", "/\t/evil.example", "/\n/evil.example", " //evil.example", "evil.example"])
    assert.equal(localPath(raw), null, JSON.stringify(raw));
  assert.equal(localPath("/dashboard/plans"), "/dashboard/plans");
  assert.equal(localPath("/dashboard/review?s=kept#top"), "/dashboard/review?s=kept#top");
});

test("admin links (waitlist, plan requests) are https only", () => {
  for (const raw of [...BAD, "mailto:a@b.co", "ftp://files.example.com/x", "https://user:pw@example.com", "localhost", "https://", "example .com", "https://exa\\mple.com"])
    assert.equal(httpsLink(raw), null, JSON.stringify(raw));
  assert.equal(httpsLink("https://label.co/demos"), "https://label.co/demos");
  assert.equal(httpsLink("http://label.co/demos"), "https://label.co/demos", "http is upgraded, never shown as http");
  assert.equal(httpsLink("label.co"), "https://label.co/");
  assert.equal(httpsLink("instagram.com/maxwell"), "https://instagram.com/maxwell");
  assert.equal(httpsLink("label.co:8443/x"), "https://label.co:8443/x");
});
