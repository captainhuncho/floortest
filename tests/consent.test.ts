import assert from "node:assert/strict";
import { test } from "node:test";
import { consentFromCookieHeader, parseConsent } from "../src/lib/consent";

test("reads a saved choice", () => {
  assert.equal(parseConsent("accepted"), "accepted");
  assert.equal(parseConsent("rejected"), "rejected");
});

test("anything else is no choice yet, so nothing optional loads", () => {
  for (const value of [undefined, null, "", "true", "yes", "ACCEPTED"]) assert.equal(parseConsent(value), null);
});

test("finds the choice among other cookies", () => {
  assert.equal(consentFromCookieHeader("ft_theme=day; ft_consent=accepted; other=1"), "accepted");
  assert.equal(consentFromCookieHeader("ft_consent=rejected"), "rejected");
  assert.equal(consentFromCookieHeader("not_ft_consent=accepted"), null);
  assert.equal(consentFromCookieHeader(""), null);
});
