import assert from "node:assert/strict";
import { test } from "node:test";
import { consentFromCookieHeader, isOpsHost, parseConsent } from "../src/lib/consent";

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

test("only the ops host counts as ops (no cookie banner, nothing optional loads there)", () => {
  const app = "https://floortest.app";
  const ops = "https://ops.floortest.app";
  assert.equal(isOpsHost("ops.floortest.app", app, ops), true);
  assert.equal(isOpsHost("floortest.app", app, ops), false, "the live site keeps the banner");
  assert.equal(isOpsHost("www.floortest.app", app, ops), false);
  assert.equal(isOpsHost("localhost:3000", "http://localhost:3000", "http://localhost:3000"), false, "local and previews share one address");
  assert.equal(isOpsHost(null, app, ops), false);
  assert.equal(isOpsHost("ops.floortest.app", app, "not a url"), false);
});
