import { httpsLink } from "./safe-links";
import { siApplemusic, siBandcamp, siBeatport, siInstagram, siSoundcloud, siSpotify, siTiktok, siYoutube } from "simple-icons";

/**
 * Profile links on a receiver's page (and later senders'). A link is only accepted on its platform's real domain,
 * so a Spotify icon can never point somewhere else. Icons: Simple Icons (CC0), used to link to each profile.
 */
export const PLATFORMS = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], icon: siInstagram.path },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"], icon: siTiktok.path },
  { key: "spotify", label: "Spotify", hosts: ["open.spotify.com"], icon: siSpotify.path },
  { key: "applemusic", label: "Apple Music", hosts: ["music.apple.com"], icon: siApplemusic.path },
  { key: "soundcloud", label: "SoundCloud", hosts: ["soundcloud.com", "on.soundcloud.com"], icon: siSoundcloud.path },
  { key: "beatport", label: "Beatport", hosts: ["beatport.com"], icon: siBeatport.path },
  { key: "bandcamp", label: "Bandcamp", hosts: ["bandcamp.com"], icon: siBandcamp.path },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be", "music.youtube.com"], icon: siYoutube.path },
] as const;
export type PlatformKey = (typeof PLATFORMS)[number]["key"] | "website";
export type ProfileLink = { platform: PlatformKey; url: string };

export const MAX_LINKS = 8;
/** The longest link saved. A longer one is refused with a message, never cut short (a cut link opens another page). */
export const MAX_LINK_CHARS = 300;
/** What a link field takes in: room for a long paste, so the person sees why it was refused instead of a silently cut link. */
export const LINK_FIELD_CHARS = 2000;
const TOO_LONG = `That link is over ${MAX_LINK_CHARS} characters. Use a shorter link to the same profile.`;

/**
 * The link on a plan request: https only (src/lib/safe-links.ts), measured as it will be saved (after https:// is added
 * and the address is encoded), and refused over the limit, never cut. Empty is fine: the field is optional.
 */
export function requestLink(raw: string): { link: string } | { error: "link" | "long" } {
  const text = raw.trim();
  if (!text) return { link: "" };
  const link = httpsLink(text);
  if (link === null) return { error: "link" };
  return link.length > MAX_LINK_CHARS ? { error: "long" } : { link };
}

/** Turn one pasted link into a recognised profile link, or explain why not. Bare "instagram.com/x" is accepted. */
export function parseLink(raw: string): ProfileLink | { error: string } {
  const text = raw.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: `"${text.slice(0, 40)}" isn't a link.` };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Links must start with https://" };
  u.protocol = "https:";
  u.hash = "";
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (!host.includes(".") || u.username || u.password) return { error: `"${text.slice(0, 40)}" isn't a link.` };
  const p = PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return { platform: p?.key ?? "website", url: u.toString() };
}

/** Where a bare username goes, for platforms that have one. */
const BY_NAME: Partial<Record<PlatformKey, (n: string) => string>> = {
  instagram: (n) => `instagram.com/${n}`,
  tiktok: (n) => `tiktok.com/@${n}`,
  soundcloud: (n) => `soundcloud.com/${n}`,
  youtube: (n) => `youtube.com/@${n}`,
};

/**
 * An Instagram profile address, by Instagram's own username rules: 1–30 letters, numbers, "." or "_", not starting or
 * ending with ".", no "..". Post, reel and other pages (instagram.com/p/…, /reel/…, /explore) aren't profiles.
 */
const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal"]);
const IG_NAME = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;
const isInstagramProfile = (u: URL) => {
  const name = u.pathname.slice(1);
  return u.hostname === "instagram.com" && !u.search && IG_NAME.test(name) && !IG_RESERVED.has(name);
};

/**
 * A link on a known platform, as it is saved (owner, 11 Nov): one form per profile, so the same profile typed another way
 * is the same text. Refuses a port (instagram.com:8443 isn't Instagram's page). Only new saves use this; links already
 * saved are shown exactly as they were (Safety, PR 510).
 */
function savedForm(r: ProfileLink): ProfileLink | { error: string } {
  if (r.platform === "website") return fits(r);
  const u = new URL(r.url);
  if (u.port) return { error: "Leave the port number out of the link." };
  return fits({ platform: r.platform, url: tidyUrl(r.platform, r.url) });
}

/** Measured as saved, after tidying, so a link that only runs long on tracking parameters still fits. */
const fits = (r: ProfileLink): ProfileLink | { error: string } => (r.url.length > MAX_LINK_CHARS ? { error: TOO_LONG } : r);

/** One profile slot: the platform the person picked, and a link (or just a username). The link must be on that platform. */
export function slotLink(platform: string, raw: string): ProfileLink | { error: string } {
  const text = raw.trim();
  const p = PLATFORMS.find((x) => x.key === platform);
  const name = text.replace(/^@/, "");
  // A username, not a link: "@name" always, dots included (Instagram's @imss.records is a profile, not a website,
  // owner 11 Nov); a bare name only without a dot, so "linktr.ee" in the Instagram slot stays a link and is refused.
  const bare = p && /^[\w.-]+$/.test(name) && (text.startsWith("@") || !name.includes("."));
  const parsed = parseLink(bare && BY_NAME[p.key] ? BY_NAME[p.key]!(name) : text);
  if ("error" in parsed) return parsed;
  if (p && parsed.platform !== p.key) return { error: `That isn't a ${p.label} link.` };
  if (!p && parsed.platform !== "website") return { error: `Pick ${PLATFORMS.find((x) => x.key === parsed.platform)!.label} for that link.` };
  const r = savedForm(parsed);
  if ("error" in r) return r;
  if (p?.key === "instagram" && !isInstagramProfile(new URL(r.url))) {
    return { error: "That isn't an Instagram profile. Use @username or instagram.com/username." };
  }
  return r;
}

/** A sender's two profile fields: Instagram (username or link) and one streaming profile. At least one is needed. */
export function senderProfiles(instagram: string, streaming: string): { links: ProfileLink[] } | { error: string } {
  const links: ProfileLink[] = [];
  if (instagram.trim()) {
    const r = slotLink("instagram", instagram);
    if ("error" in r) return { error: `Instagram: ${r.error}` };
    links.push(r);
  }
  if (streaming.trim()) {
    const r = parseLink(streaming);
    if ("error" in r) return { error: `Streaming profile: ${r.error}` };
    if (r.platform === "website" || r.platform === "instagram") return { error: "Streaming profile: use a Spotify, Apple Music, SoundCloud, Beatport, Bandcamp, YouTube or TikTok link." };
    const saved = savedForm(r);
    if ("error" in saved) return { error: `Streaming profile: ${saved.error}` };
    links.push(saved);
  }
  if (!links.length) return { error: "Add your Instagram or a streaming profile, so the receiver knows who you are." };
  return { links };
}

/** Links from a textarea, one per line: recognised, de-duplicated, at most MAX_LINKS. */
export function parseLinks(raw: string): { links: ProfileLink[]; error?: string } {
  const links: ProfileLink[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const r = parseLink(line);
    if ("error" in r) return { links, error: r.error };
    if (r.url.length > MAX_LINK_CHARS) return { links, error: TOO_LONG };
    if (!links.some((l) => l.url === r.url)) links.push(r);
  }
  if (links.length > MAX_LINKS) return { links, error: `Up to ${MAX_LINKS} links.` };
  return { links };
}

// Query parameters that only say where a link was shared from; dropping them never changes the page it opens.
const TRACKING = /^(utm_\w+|igsh|igshid|si|is_from_webapp|feature)$/i;

// The profile addresses whose username ignores letter case: instagram.com/IMSSRecords is instagram.com/imssrecords. Only on
// the main host and in exactly this shape: short links (vm.tiktok.com/ZMeAbCd, on.soundcloud.com/AbCdE) keep their case.
const ANY_CASE: Partial<Record<PlatformKey, { host: string; path: RegExp }>> = {
  instagram: { host: "instagram.com", path: /^\/[^/]+$/ },
  tiktok: { host: "tiktok.com", path: /^\/@[^/]+$/ },
  soundcloud: { host: "soundcloud.com", path: /^\/[^/]+$/ },
};

// The only hosts written with www. or m. in front that are the same site without it. Anywhere else the prefix can be
// another site: m.imss.com, www.github.io, m.imss.bandcamp.com and m.vm.tiktok.com aren't the pages without it.
const MAIN_HOSTS = new Set(["instagram.com", "tiktok.com", "soundcloud.com", "youtube.com", "beatport.com"]);

/** A query without its tracking parameters. Every other part is kept byte for byte, never decoded and re-encoded. */
function dropTracking(search: string): string {
  const kept = search.replace(/^\?/, "").split("&").filter((part) => {
    try {
      return !TRACKING.test(decodeURIComponent(part.split("=")[0].replace(/\+/g, " ")));
    } catch {
      return true;
    }
  });
  const query = kept.join("&");
  return query ? `?${query}` : "";
}

/**
 * A link written one way. A website only loses its fragment and gets a lower-case host: www.imss.com, m.imss.com and
 * imss.com/about/ stay apart from imss.com and imss.com/about, since another owner's site can sit at each (Safety, PR 510).
 * On a known platform it also loses a trailing slash, www./m. on the platform's main host only (MAIN_HOSTS), tracking
 * parameters (?igsh=, ?si=, utm_…, never ones that pick the page, like YouTube's ?v=), and a username's case where
 * ANY_CASE says so.
 */
function tidyUrl(platform: PlatformKey, url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (platform === "website") return u.toString();
  const bare = u.hostname.replace(/^(www|m)\./, "");
  if (MAIN_HOSTS.has(bare)) u.hostname = bare;
  u.pathname = u.pathname.replace(/\/+$/, "");
  u.search = dropTracking(u.search);
  const shape = ANY_CASE[platform];
  if (shape && u.hostname === shape.host && shape.path.test(u.pathname)) u.pathname = u.pathname.toLowerCase();
  // A bare host still saves without "/" (https://imss.bandcamp.com). With a query, a "/" at the end is the query's own.
  return u.search ? u.toString() : u.toString().replace(/\/$/, "");
}

/**
 * The profile a link points to, ignoring how it was written: "@name", "instagram.com/name", "https://www.instagram.com/name/"
 * and "…/name/?igsh=…" are one Instagram profile (see tidyUrl). Anything that can open a different page stays different:
 * another host or subdomain, a port, a short-link code's case, a page-picking query, and on a website a trailing slash.
 * Used to tell a real change of profile from a re-typed one (the Verified mark).
 */
export function profileKey(link: ProfileLink): string {
  let u: URL;
  try {
    u = new URL(tidyUrl(link.platform, link.url));
  } catch {
    return `${link.platform} ${link.url}`;
  }
  const path = link.platform === "website" ? u.pathname : u.pathname.replace(/\/$/, "");
  return `${link.platform} ${u.host}${path}${u.search}`;
}

/** True when both lists point to the same profiles, whatever order or spelling they were written in. */
export function sameProfiles(a: ProfileLink[], b: ProfileLink[]) {
  const keys = (l: ProfileLink[]) => [...new Set(l.map(profileKey))].sort().join("\n");
  return keys(a) === keys(b);
}

/** Saved links, re-checked on the way out so nothing odd ever renders. */
export function readLinks(json: string | null | undefined): ProfileLink[] {
  try {
    const v = JSON.parse(json || "[]");
    if (!Array.isArray(v)) return [];
    return v.flatMap((l) => {
      const r = typeof l?.url === "string" ? parseLink(l.url) : null;
      return r && !("error" in r) ? [r] : [];
    }).slice(0, MAX_LINKS);
  } catch {
    return [];
  }
}
