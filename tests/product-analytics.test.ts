import assert from "node:assert/strict";
import { test } from "node:test";
import { clearPosthogStorage, mayRecord, recordingAllowed, redactAnalyticsUrl, redactEventUrls } from "../src/lib/product-analytics";

test("only the listed desk and public pages may be recorded", () => {
  for (const path of ["/", "/dashboard/floor", "/dashboard/review", "/dashboard/collections/12"]) assert.equal(mayRecord(path), true, path);
});

test("everything else is never recorded: sign-in, private links, contacts, settings, admin, plans, checkout", () => {
  for (const path of [
    "/login", "/signup", "/reset/abc", "/ops-login", "/admin", "/admin/users", "/dashboard/account", "/dashboard/settings/security",
    "/dashboard/plans", "/dashboard/checkout", "/dashboard/contacts/4", "/dashboard/view-as", "/receipt/tok", "/join/tok", "/c/x",
    "/newsletter/confirm/abc", "/coming-soon", "/dashboard/floorplan", "/pricing", "/pricingx", "/s/abc", "/upload",
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

test("only paging and view keys stay in a query; searches, codes, emails and fragments go", () => {
  assert.equal(redactAnalyticsUrl("https://floortest.app/signup?team=abc123&x=1"), "https://floortest.app/signup");
  assert.equal(redactAnalyticsUrl("/signup?invite=QWE&email=a@b.co&next=/dashboard"), "/signup");
  assert.equal(redactAnalyticsUrl("/receipt/secret123?code=9"), "/receipt/[token]");
  assert.equal(
    redactAnalyticsUrl("https://floortest.app/dashboard/review?q=sam%40label.co&sender=Sam&genre=house&p=2&view=grid#cookie-settings"),
    "https://floortest.app/dashboard/review?p=2&view=grid",
  );
  assert.equal(redactAnalyticsUrl("/dashboard/contacts?Q=x&ref=y&handle=z&to=w&tab=all&folder=3"), "/dashboard/contacts?tab=all&folder=3");
  assert.equal(redactAnalyticsUrl("/admin/users?q=bob"), "/admin/users");
  // Kept keys keep only short plain values.
  assert.equal(redactAnalyticsUrl("/dashboard/review?p=2&view=sam%40label.co&tab=Sam+Sender&folder=" + "a".repeat(33)), "/dashboard/review?p=2");
});

test("campaign and ad-click properties are dropped, also as initial values", () => {
  const event = redactEventUrls({
    event: "$pageview",
    properties: { utm_source: "x", utm_term: "secret", gad_source: "1", mc_cid: "c", gclid: "g", fbclid: "f", msclkid: "m", ph_keyword: "k", $os: "Mac" },
    $set_once: { $initial_utm_campaign: "secret", $initial_gclid: "g", $initial_pathname: "/" },
  });
  assert.deepEqual(event.properties, { $os: "Mac" });
  assert.deepEqual(event.$set_once, { $initial_pathname: "/" });
});

test("campaign and ad-click properties are dropped as session-entry values too, with every click id PostHog knows", () => {
  const event = redactEventUrls({
    event: "$pageview",
    properties: {
      $session_entry_utm_content: "secret",
      $session_entry_utm_term: "secret",
      $session_entry_gclid: "g",
      $session_entry_gad_source: "1",
      $session_entry_mc_cid: "c",
      $session_entry_ph_keyword: "k",
      $session_entry_oppref: "o",
      $session_entry_bfcid: "b",
      oppref: "o",
      bfcid: "b",
      $initial_bfcid: "b",
      $session_entry_host: "floortest.app",
    },
  });
  assert.deepEqual(event.properties, { $session_entry_host: "floortest.app" });
});

test("every URL-like property loses keys and searches, including session entry, initial and top-level $set_once, and the title is dropped", () => {
  const event = redactEventUrls({
    event: "$pageview",
    properties: {
      $current_url: "https://floortest.app/receipt/secret123",
      $pathname: "/reset/abc",
      $referrer: "https://floortest.app/c/k9",
      $prev_pageview_url: "https://floortest.app/dashboard/review?q=sam@label.co",
      $session_entry_url: "https://floortest.app/signup?team=t1",
      $session_entry_pathname: "/join/zz",
      $session_entry_referrer: "https://floortest.app/c/k9",
      title: "Sam Sender — FloorTest",
      other: 1,
    },
    $set: { $current_url: "https://floortest.app/dashboard/contacts?q=x" },
    $set_once: { $initial_current_url: "https://floortest.app/signup?invite=i9", $initial_pathname: "/receipt/r1" },
  });
  const p = event.properties;
  assert.equal(p.$current_url, "https://floortest.app/receipt/[token]");
  assert.equal(p.$pathname, "/reset/[token]");
  assert.equal(p.$referrer, "https://floortest.app/c/[token]");
  assert.equal(p.$prev_pageview_url, "https://floortest.app/dashboard/review");
  assert.equal(p.$session_entry_url, "https://floortest.app/signup");
  assert.equal(p.$session_entry_pathname, "/join/[token]");
  assert.equal(p.$session_entry_referrer, "https://floortest.app/c/[token]");
  assert.equal("title" in p, false);
  assert.equal(p.other, 1);
  assert.deepEqual(event.$set, { $current_url: "https://floortest.app/dashboard/contacts" });
  assert.deepEqual(event.$set_once, { $initial_current_url: "https://floortest.app/signup", $initial_pathname: "/receipt/[token]" });
});

test("replay frames lose searches and keys from the Meta href and from custom page events", () => {
  const event = redactEventUrls({
    event: "$snapshot",
    properties: {
      $snapshot_data: [
        { type: 4, data: { href: "https://floortest.app/dashboard/review?q=sam@label.co", width: 1, height: 1 } },
        { type: 5, data: { tag: "$url_changed", payload: { href: "https://floortest.app/receipt/tok?q=x" } } },
        { type: 3, data: { source: 2 } },
      ],
    },
  });
  assert.deepEqual(event.properties.$snapshot_data, [
    { type: 4, data: { href: "https://floortest.app/dashboard/review", width: 1, height: 1 } },
    { type: 5, data: { tag: "$url_changed", payload: { href: "https://floortest.app/receipt/[token]" } } },
    { type: 3, data: { source: 2 } },
  ]);
});

test("after Not now or Cookie settings, PostHog storage goes from both storages and cookies; the opt-out record only while PostHog is live", () => {
  const store = (keys: string[]) => {
    const items = new Map(keys.map((k) => [k, "1"]));
    return { items, get length() { return items.size; }, key: (i: number) => [...items.keys()][i] ?? null, removeItem: (k: string) => void items.delete(k) };
  };
  const local = store(["ph_phc_x_posthog", "__ph_opt_in_out_phc_x", "_postHogToolbarParams", "ft_view"]);
  const session = store(["ph_phc_x_window_id", "ph_phc_x_primary_window_exists", "ph_replay_pending_buffer_1", "ft_tab"]);
  const written: string[] = [];
  const doc = { get cookie() { return "ph_phc_x_posthog=1; ft_consent=rejected"; }, set cookie(v: string) { written.push(v); } };
  clearPosthogStorage([local, session], doc, true);
  assert.deepEqual([...local.items.keys()], ["__ph_opt_in_out_phc_x", "ft_view"]);
  assert.deepEqual([...session.items.keys()], ["ft_tab"]);
  assert.deepEqual(written, ["ph_phc_x_posthog=; Max-Age=0; Path=/; SameSite=Lax"]);
  clearPosthogStorage([local, session], doc);
  assert.deepEqual([...local.items.keys()], ["ft_view"]);
});
