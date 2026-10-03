/** Line icons for navigation, in the same style as the Figma tab-bar icons (24px grid, 1.8 stroke). */
const PATHS = {
  floor: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  queue: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l4 4 4-4M12 8v8",
  collections: "M16 6l4 14M12 6v14M8 8v12M4 4v16",
  prepare: "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  contacts: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
} as const;
export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name, className = "size-[18px]" }: { name: NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
