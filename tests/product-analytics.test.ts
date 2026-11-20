import assert from "node:assert/strict";
import { test } from "node:test";
import { clearPosthogStorage, mayRecord, redactEventUrls } from "../src/lib/product-analytics";

test("sign-in, account, admin, plans and checkout pages are never recorded", () => {
  for (const path of ["/login", "/signup", "/reset/abc", "/ops-login", "/admin", "/admin/users", "/dashboard/account", "/dashboard/settings/security", "/dashboard/plans", "/dashboard/checkout", "/receipt/tok", "/join/tok"]) {
    assert.equal(mayRecord(path), false, path);
  }
});

test("the desk and public pages may be recorded", () => {
  for (const path of ["/", "/dashboard/floor", "/dashboard/review", "/pricing", "/dashboard/planscope", "/loginhelp"]) {
    assert.equal(mayRecord(path), true, path);
  }
});

test("private-link keys are removed from event URLs", () => {
  const event = redactEventUrls({ event: "$pageview", properties: { $current_url: "https://floortest.app/receipt/secret123", $pathname: "/reset/abc", $referrer: "https://floortest.app/c/k9", other: 1 } });
  assert.equal(event.properties.$current_url, "https://floortest.app/receipt/[token]");
  assert.equal(event.properties.$pathname, "/reset/[token]");
  assert.equal(event.properties.$referrer, "https://floortest.app/c/[token]");
  assert.equal(event.properties.other, 1);
});

test("after Not now, PostHog storage is removed and nothing else", () => {
  const items = new Map([["ph_phc_x_posthog", "1"], ["__ph_opt_in_out", "1"], ["ft_view", "keep"]]);
  const storage = { get length() { return items.size; }, key: (i: number) => [...items.keys()][i] ?? null, removeItem: (k: string) => void items.delete(k) };
  const written: string[] = [];
  const doc = { get cookie() { return "ph_phc_x_posthog=1; ft_consent=rejected"; }, set cookie(v: string) { written.push(v); } };
  clearPosthogStorage(storage, doc);
  assert.deepEqual([...items.keys()], ["ft_view"]);
  assert.deepEqual(written, ["ph_phc_x_posthog=; Max-Age=0; Path=/; SameSite=Lax"]);
});
