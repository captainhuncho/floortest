import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingTarget, shownPath } from "../src/lib/nav-pending";

// The instant pending state on navigation (src/components/useNavPath.ts): which clicks light a menu item at once.
const ORIGIN = "https://floortest.app";
const click = (over: Partial<Parameters<typeof pendingTarget>[0]> = {}) =>
  pendingTarget({ button: 0, modified: false, href: `${ORIGIN}/dashboard/review`, target: "", download: false, origin: ORIGIN, path: "/dashboard/floor", ...over });

test("a plain click on an in-app link to another page is pending on that page", () => {
  assert.equal(click(), "/dashboard/review");
  assert.equal(click({ href: `${ORIGIN}/admin/accounts?view=pro#top`, path: "/admin" }), "/admin/accounts");
  assert.equal(click({ target: "_self" }), "/dashboard/review");
});

test("new tabs, other buttons, downloads, other sites and endpoints aren't page changes here", () => {
  assert.equal(click({ modified: true }), null, "cmd/ctrl/shift/alt-click opens elsewhere");
  assert.equal(click({ button: 1 }), null, "middle click");
  assert.equal(click({ target: "_blank" }), null);
  assert.equal(click({ download: true }), null);
  assert.equal(click({ href: "https://evil.example/dashboard/review" }), null, "another origin");
  assert.equal(click({ href: "mailto:help@floortest.app" }), null);
  assert.equal(click({ href: `${ORIGIN}/api/tracks/1/download` }), null);
  assert.equal(click({ href: "http://[" }), null, "an unreadable href");
});

test("the page you're on (a new search or #section) isn't a page change", () => {
  assert.equal(click({ href: `${ORIGIN}/dashboard/floor?x=1` }), null);
  assert.equal(click({ href: `${ORIGIN}/dashboard/floor#week` }), null);
});

test("menus mark the tapped page while the address still shows the page it left, then the real one", () => {
  const pending = { from: "/admin", to: "/admin/inbox" };
  assert.equal(shownPath("/admin", null), "/admin");
  assert.equal(shownPath("/admin", pending), "/admin/inbox");
  assert.equal(shownPath("/admin/inbox", pending), "/admin/inbox", "arrived");
  assert.equal(shownPath("/admin/accounts", pending), "/admin/accounts", "went somewhere else: the leftover doesn't count");
});
