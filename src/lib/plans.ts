export const PLANS = {
  free: { name: "Free", price: 0, limit: 20, blurb: "Delete a track and the slot returns" },
  pro: { name: "Pro", price: 6.99, limit: 500, blurb: "For active DJs and curators" },
  team: { name: "Team", price: 12.99, limit: 2000, blurb: "Shared collections and receivers" },
} as const;

export type PlanId = keyof typeof PLANS;

/**
 * Stems (ask a sender for stems, they upload them to the track) are built but not released:
 * they'll be a paid feature. While this is empty, nothing about stems shows and the API refuses.
 */
export const STEMS_PLANS: readonly PlanId[] = [];
export const stemsEnabled = (plan: string) => (STEMS_PLANS as readonly string[]).includes(plan);

/** Colleagues can download a shared track only when the receiver who shared it is on a paid plan. */
export const SHARE_DOWNLOAD_PLANS: readonly PlanId[] = ["pro", "team"];
export const shareDownloadEnabled = (plan: string) => (SHARE_DOWNLOAD_PLANS as readonly string[]).includes(plan);

export function planOf(id: string) {
  return PLANS[(id in PLANS ? id : "free") as PlanId];
}

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
export const ACCEPTED_MIME = ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave", "audio/mpeg", "audio/mp3"];
export const ACCEPTED_EXT = [".wav", ".mp3"];

export const RESERVED_HANDLES = new Set([
  "api", "dashboard", "sent", "waitlist", "login", "signup", "logout", "t", "s", "settings", "pricing", "about", "admin", "floortest", "v", "trust", "licenses", "contact", "terms", "privacy", "forgot", "reset", "verify-email", "confirm-email", "unsubscribe", "robots.txt", "sitemap.xml", "icon.svg", "_next", "static", "favicon.ico",
]);

/** Signal definitions. These are shown to receivers and senders, so they must stay strict. */
export const SIGNALS = {
  listened: "Played for at least 30 seconds, or a quarter of the track if it's shorter",
  downloaded: "The original file finished downloading",
  kept: "The receiver explicitly kept it. Private to the receiver",
  replied: "The receiver sent you a message",
  playedOut: "The receiver played it out in a set",
} as const;
export const LISTEN_MIN_SECONDS = 30;
export const LISTEN_MIN_FRACTION = 0.25;
export const listenThreshold = (duration: number | null | undefined) =>
  duration && duration > 0 ? Math.min(LISTEN_MIN_SECONDS, duration * LISTEN_MIN_FRACTION) : LISTEN_MIN_SECONDS;

/** Retention: kept tracks stay until the receiver deletes them. */
export const RETAIN_UNREVIEWED_DAYS = 90;
export const RETAIN_PASSED_DAYS = 30;
const DAY = 86_400_000;
export function deletesAt(t: { decision: string | null; decided_at: number | null; created_at: number }) {
  if (t.decision === "kept") return null;
  if (t.decision === "passed") return (t.decided_at ?? t.created_at) + RETAIN_PASSED_DAYS * DAY;
  return t.created_at + RETAIN_UNREVIEWED_DAYS * DAY;
}

/** Intake limits per receiver link. */
export const RATE_PER_IP_PER_HOUR = 10;
export const RATE_PER_EMAIL_PER_DAY = 5;

/** Sender-declared context. Labels are shared by both public page styles and the review panel. */
export const RELEASE_STATUS = { unsigned: "Unreleased demo", signed: "Signed, forthcoming", released: "Already released" } as const;
export const MIX_STATUS = { raw: "Raw / work in progress", mixed: "Mixed, not mastered", mastered: "Fully mixed & mastered" } as const;

/** Offered to senders when a collection hasn't set its own genre list. */
export const DEFAULT_GENRES = [
  "Afro House",
  "Amapiano",
  "Afrobeats",
  "House",
  "Deep House",
  "Tech House",
  "Techno",
  "Melodic Techno",
  "Minimal / Deep Tech",
  "Progressive House",
  "Disco / Nu-Disco",
  "UK Garage",
  "Drum & Bass",
  "Dubstep / Bass",
  "Dancehall",
  "Hip-Hop / R&B",
  "Downtempo / Electronica",
];
export const MAX_GENRE_LENGTH = 40;

/** A collection's own genre list, or the defaults. */
export function genresFor(c: { genres: string } | undefined | null): { list: string[]; custom: boolean } {
  try {
    const parsed = c?.genres ? JSON.parse(c.genres) : null;
    if (Array.isArray(parsed) && parsed.length) return { list: parsed.filter((g) => typeof g === "string"), custom: true };
  } catch {}
  return { list: DEFAULT_GENRES, custom: false };
}

export const cleanGenre = (g: string) => g.replace(/\s+/g, " ").trim().slice(0, MAX_GENRE_LENGTH);
