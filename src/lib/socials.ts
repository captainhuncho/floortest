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

/** Where a bare username goes, for platforms that have one. */
const BY_NAME: Partial<Record<PlatformKey, (n: string) => string>> = {
  instagram: (n) => `instagram.com/${n}`,
  tiktok: (n) => `tiktok.com/@${n}`,
  soundcloud: (n) => `soundcloud.com/${n}`,
  youtube: (n) => `youtube.com/@${n}`,
};

/** One profile slot: the platform the person picked, and a link (or just a username). The link must be on that platform. */
export function slotLink(platform: string, raw: string): ProfileLink | { error: string } {
  const text = raw.trim();
  const p = PLATFORMS.find((x) => x.key === platform);
  const name = text.replace(/^@/, "");
  const r = parseLink(p && /^[\w.-]+$/.test(name) && !name.includes(".") && BY_NAME[p.key] ? BY_NAME[p.key]!(name) : text);
  if ("error" in r) return r;
  if (p && r.platform !== p.key) return { error: `That isn't a ${p.label} link.` };
  if (!p && r.platform !== "website") return { error: `Pick ${PLATFORMS.find((x) => x.key === r.platform)!.label} for that link.` };
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
    links.push(r);
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
