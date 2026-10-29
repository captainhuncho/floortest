import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

const jar = (c: Record<string, string>) => ({ get: (n: string) => (n in c ? { value: c[n] } : undefined) });

test("share-link cookies carry the __Host- prefix on the live site and the plain name locally", async () => {
  const { linkCookieName } = await import("../src/lib/link-cookies");
  assert.equal(linkCookieName("session", 7, true), "__Host-ft_ls_7");
  assert.equal(linkCookieName("proven", 7, true), "__Host-ft_lp_7");
  assert.equal(linkCookieName("session", 7, false), "ft_ls_7", "plain http locally: the browser would refuse a __Host- cookie");
});

test("a link session under the old name still works until the cut-off, then only the prefixed name counts", async () => {
  const { OLD_LINK_COOKIE_UNTIL, readLinkCookie } = await import("../src/lib/link-cookies");
  const before = OLD_LINK_COOKIE_UNTIL - 1;
  const after = OLD_LINK_COOKIE_UNTIL;
  assert.equal(readLinkCookie(jar({ "__Host-ft_ls_7": "new" }), "session", 7, true, after), "new", "the current name always works");
  assert.equal(readLinkCookie(jar({ ft_ls_7: "old" }), "session", 7, true, before), "old", "before the cut-off the old name is still read");
  assert.equal(readLinkCookie(jar({ ft_ls_7: "old" }), "session", 7, true, after), undefined, "after it, ignored");
  assert.equal(readLinkCookie(jar({ "__Host-ft_ls_7": "new", ft_ls_7: "old" }), "session", 7, true, before), "new", "the prefixed one wins");
  assert.equal(readLinkCookie(jar({ ft_ls_8: "old" }), "session", 7, true, before), undefined, "another link's cookie never counts");
  assert.equal(readLinkCookie(jar({ ft_lp_7: "x" }), "proven", 7, false, after), "x", "locally the plain name is the current one");
});
