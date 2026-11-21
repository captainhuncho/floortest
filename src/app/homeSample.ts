/** Sample tracks for the home page's pictures (no real people or music): title, artist, BPM, length. */
export const TRACKS = [
  ["Second Light", "Nadia Okafor", "124", "5:41"],
  ["Night Bus (VIP)", "Tomi Ade", "126", "6:20"],
  ["Harmattan", "Kwesi Boateng", "118", "6:12"],
  ["Kenkey Groove", "Efua Darko", "122", "4:02"],
  ["Harbour Lights", "Leon Brandt", "122", "7:15"],
] as const;

/** The review card steps through the first four. */
export const REVIEW_TRACKS = TRACKS.slice(0, 4);
