/**
 * Links people type that we later show as a link (audit 27 Oct, rule 4). Parsed with the real URL parser, never only
 * a pattern, so `javascript:`, `data:` and look-alikes never become a clickable address.
 */

/**
 * An outside web address, always as https: "example.com/x", "http://…" and "https://…" come back as "https://…";
 * anything else (javascript:, data:, mailto:, no real host, a user name or password in it) is null.
 */
export function httpsLink(raw: string): string | null {
  const text = raw.trim();
  if (!text || /[\s\u0000-\u001f\u007f\\]/.test(text)) return null;
  // Only add https:// when there is no scheme at all, so "javascript:…" stays javascript: and is refused below.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^:/]+:\d+(?:\/|$)/.test(text);
  let u: URL;
  try {
    u = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".") || u.username || u.password) return null;
  u.protocol = "https:";
  return u.toString();
}

/**
 * A path on FloorTest itself ("/dashboard/plans"), for links admins put in announcements; null for anything that
 * would leave the site: another site, "//host", "/\host", javascript:/data:, or tabs and line breaks (which browsers
 * drop, turning "/\t/host" into "//host"). Owner's open-redirect rule, 23 Oct.
 */
export function localPath(raw: string): string | null {
  const text = raw.trim();
  if (!text.startsWith("/") || text.startsWith("//") || /[\s\u0000-\u001f\u007f\\]/.test(text)) return null;
  const base = "https://floortest.invalid";
  try {
    const u = new URL(text, base);
    return u.origin === base ? text : null;
  } catch {
    return null;
  }
}
