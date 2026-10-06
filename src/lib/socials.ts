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
  return { platform: p?.key ?? "website", url: u.toString().slice(0, 300) };
}

/** Links from a textarea, one per line: recognised, de-duplicated, at most MAX_LINKS. */
export function parseLinks(raw: string): { links: ProfileLink[]; error?: string } {
  const links: ProfileLink[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const r = parseLink(line);
    if ("error" in r) return { links, error: r.error };
    if (!links.some((l) => l.url === r.url)) links.push(r);
  }
  if (links.length > MAX_LINKS) return { links, error: `Up to ${MAX_LINKS} links.` };
  return { links };
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
