/**
 * Where sign-in may land afterwards (the `floortest_next` cookie): only a collection shared with your account
 * (`/c/a.<id>`) or a team invite (`/join/<invite>`). Anything else is ignored, so the cookie can't send people elsewhere.
 */
export const NEXT_COOKIE = "floortest_next";
/** A team invite being accepted through sign-up (password or Google): its secret, for an hour. */
export const TEAM_INVITE_COOKIE = "ft_team_invite";
export const safeNext = (next: string) => /^\/c\/a\.\d{1,12}$/.test(next) || /^\/join\/[A-Za-z0-9_-]{20,64}$/.test(next);

/**
 * A path on this site to go back to (the coming-soon gate). Browsers read `\` as `/` and drop tabs and newlines, so
 * `/\evil.com` would become `//evil.com`, another site: anything with those is refused, as is a second leading slash
 * or one that dot segments would make.
 */
export const localPath = (next: string) =>
  /^\/(?![/\\])[^\\\x00-\x1f]*$/.test(next) && !next.startsWith("/coming-soon") && !collapsesToHost(next) ? next : "/";

/**
 * True when dot segments ("/..//evil.com", "/%2e%2e//evil.com") resolve to a path starting "//". Harmless as a Location
 * path on this origin, but refused anyway so nothing downstream can mistake it for another host.
 */
function collapsesToHost(path: string) {
  try {
    return new URL(path, "https://floortest.invalid").pathname.startsWith("//");
  } catch {
    return true;
  }
}
