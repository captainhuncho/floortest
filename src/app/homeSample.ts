/**
 * Sample tracks for the home page's pictures (no real people or music): title, artist, BPM, length, cover.
 * The covers are original drawings made for this page, 152 px WebP in public/brand/home-covers (shown at 38 to 48 px).
 */
export const TRACKS = [
  ["Second Light", "Nadia Okafor", "124", "5:41", "second-light"],
  ["Night Bus (VIP)", "Tomi Ade", "126", "6:20", "night-bus-vip"],
  ["Harmattan", "Kwesi Boateng", "118", "6:12", "harmattan"],
  ["Kenkey Groove", "Efua Darko", "122", "4:02", "kenkey-groove"],
  ["Harbour Lights", "Leon Brandt", "122", "7:15", "harbour-lights"],
] as const;

/** The review card steps through the first four. */
export const REVIEW_TRACKS = TRACKS.slice(0, 4);

/** A sample cover's address. Self-hosted, so nothing loads from another site. */
export const coverSrc = (slug: string) => `/brand/home-covers/${slug}.webp`;
