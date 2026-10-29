/**
 * The one rule for which site the phone app runs (used by capacitor.config.ts and write-start.mjs). A release build is
 * always https://floortest.app; anything else (your local copy, a preview) needs FLOORTEST_DEV=1, so a stray
 * FLOORTEST_URL can't ship. Only the app's own host may open inside the app and reach its native pieces (share inbox,
 * offline tracks): no wildcard subdomains, and localhost only when the dev site is local. Everything else, ops
 * included, opens in the phone's browser.
 */
const RELEASE = "https://floortest.app";
const LOCAL = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

export function appSite(env: Record<string, string | undefined>): { site: string; hosts: string[] } {
  const raw = env.FLOORTEST_URL ?? RELEASE;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`FLOORTEST_URL isn't an address: ${raw}`);
  }
  if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) {
    throw new Error(`FLOORTEST_URL must be just the site, like ${RELEASE}`);
  }
  const site = u.origin;
  if (site === RELEASE) return { site, hosts: ["floortest.app"] };
  if (env.FLOORTEST_DEV !== "1") {
    throw new Error(`A release build only runs ${RELEASE} (got ${site}). For a local copy or a preview, set FLOORTEST_DEV=1 too.`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`FLOORTEST_URL must be http or https: ${raw}`);
  const hosts = ["floortest.app", u.hostname];
  if (LOCAL.has(u.hostname) && !hosts.includes("localhost")) hosts.push("localhost");
  return { site, hosts: [...new Set(hosts)] };
}
