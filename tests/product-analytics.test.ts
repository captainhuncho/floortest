import assert from "node:assert/strict";
import { test } from "node:test";
import { clearPosthogStorage, mayRecord, recordingAllowed, redactAnalyticsUrl, redactEventUrls } from "../src/lib/product-analytics";

test("only the listed desk and public pages may be recorded", () => {
  for (const path of ["/", "/dashboard/floor", "/dashboard/review", "/dashboard/collections/12", "/pricing"]) assert.equal(mayRecord(path), true, path);
});

test("everything else is never recorded: sign-in, private links, contacts, settings, admin, plans, checkout", () => {
  for (const path of [
    "/login", "/signup", "/reset/abc", "/ops-login", "/admin", "/admin/users", "/dashboard/account", "/dashboard/settings/security",
    "/dashboard/plans", "/dashboard/checkout", "/dashboard/contacts/4", "/dashboard/view-as", "/receipt/tok", "/join/tok", "/c/x",
    "/newsletter/confirm/abc", "/coming-soon", "/dashboard/floorplan", "/pricingx",
  ]) {
    assert.equal(mayRecord(path), false, path);
  }
});

test("an admin view is never recorded, even on an allowed page", () => {
  const marked = { querySelector: (s: string) => (s === "[data-recording-off]" ? ({} as Element) : null) };
  const plain = { querySelector: () => null };
  assert.equal(recordingAllowed("/dashboard/floor", marked), false);
  assert.equal(recordingAllowed("/dashboard/floor", plain), true);
});

test("invite codes, tokens, emails and next pages are removed from query strings", () => {
  assert.equal(redactAnalyticsUrl("https://floortest.app/signup?team=abc123&x=1"), "https://floortest.app/signup?team=[redacted]&x=1");
  assert.equal(redactAnalyticsUrl("/signup?invite=QWE&email=a@b.co&next=/dashboard"), "/signup?invite=[redacted]&email=[redacted]&next=[redacted]");
  assert.equal(redactAnalyticsUrl("/receipt/secret123?code=9"), "/receipt/[token]?code=[redacted]");
});

test("every URL-like property loses keys, including session entry, initial and $set_once, and the title is dropped", () => {
  const event = redactEventUrls({
    event: "$pageview",
    properties: {
      $current_url: "https://floortest.app/receipt/secret123",
      $pathname: "/reset/abc",
      $referrer: "https://floortest.app/c/k9",
      $session_entry_url: "https://floortest.app/signup?team=t1",
      $session_entry_pathname: "/join/zz",
      $session_entry_referrer: "https://floortest.app/c/k9",
      title: "Sam Sender — FloorTest",
      $set_once: { $initial_current_url: "https://floortest.app/signup?invite=i9", $initial_pathname: "/receipt/r1" },
      other: 1,
    },
  });
  const p = event.properties;
  assert.equal(p.$current_url, "https://floortest.app/receipt/[token]");
  assert.equal(p.$pathname, "/reset/[token]");
  assert.equal(p.$referrer, "https://floortest.app/c/[token]");
  assert.equal(p.$session_entry_url, "https://floortest.app/signup?team=[redacted]");
  assert.equal(p.$session_entry_pathname, "/join/[token]");
  assert.equal(p.$session_entry_referrer, "https://floortest.app/c/[token]");
  assert.equal("title" in p, false);
  assert.deepEqual(p.$set_once, { $initial_current_url: "https://floortest.app/signup?invite=[redacted]", $initial_pathname: "/receipt/[token]" });
  assert.equal(p.other, 1);
});

test("after Not now or Cookie settings, PostHog storage goes from both storages and cookies, and nothing else", () => {
  const store = (keys: string[]) => {
    const items = new Map(keys.map((k) => [k, "1"]));
    return { items, get length() { return items.size; }, key: (i: number) => [...items.keys()][i] ?? null, removeItem: (k: string) => void items.delete(k) };
  };
  const local = store(["ph_phc_x_posthog", "__ph_opt_in_out_phc_x", "ft_view"]);
  const session = store(["ph_phc_x_window_id", "ph_phc_x_primary_window_exists", "ph_replay_pending_buffer_1", "ft_tab"]);
  const written: string[] = [];
  const doc = { get cookie() { return "ph_phc_x_posthog=1; ft_consent=rejected"; }, set cookie(v: string) { written.push(v); } };
  clearPosthogStorage([local, session], doc);
  assert.deepEqual([...local.items.keys()], ["ft_view"]);
  assert.deepEqual([...session.items.keys()], ["ft_tab"]);
  assert.deepEqual(written, ["ph_phc_x_posthog=; Max-Age=0; Path=/; SameSite=Lax"]);
});
