import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail } from "../src/lib/mask-email";

// Private link pages show an address as m•••@g•••.com to anyone who only has the link (owner, 2 Nov).
test("maskEmail keeps the first letters and the last part of the domain", () => {
  assert.equal(maskEmail("maya@gmail.com"), "m•••@g•••.com");
  assert.equal(maskEmail("  Maya.Lin@Example.org "), "M•••@E•••.org");
});

test("maskEmail with a one-letter name", () => {
  assert.equal(maskEmail("a@x.io"), "a•••@x•••.io");
});

test("maskEmail hides subdomains, showing only the last label", () => {
  assert.equal(maskEmail("a@mail.co.uk"), "a•••@m•••.uk");
  assert.equal(maskEmail("dj@studio.label.example.com"), "d•••@s•••.com");
});

test("maskEmail hides plus-addressing tags", () => {
  const m = maskEmail("a+tag@x.co");
  assert.equal(m, "a•••@x•••.co");
  assert.ok(!m.includes("tag"));
});

test("maskEmail never echoes empty or invalid input", () => {
  for (const bad of ["", "   ", null, undefined, "no-at-sign", "@x.com", "a@", "a@localhost", "a b@x.com", "secret@@"]) assert.equal(maskEmail(bad), "•••", String(bad));
});

test("maskEmail never contains the full address", () => {
  for (const e of ["maya@gmail.com", "kofi.mensah@team.io", "a+b@c.de"]) {
    const m = maskEmail(e);
    assert.ok(!m.includes(e.split("@")[0].slice(1) || "\u0000"), `${e} → ${m}`);
    assert.ok(!m.includes(e.split("@")[1]), `${e} → ${m}`);
  }
});
