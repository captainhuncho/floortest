/**
 * The Contacts list's sort and filter choices. The address only ever picks one of these by key; its SQL comes from
 * this fixed list, never from the request, and an unknown key falls back to the first (owner's SQL rule, 24 Oct).
 */
export const SORTS = [
  ["recent", "Recent", "last_at DESC NULLS LAST"],
  ["kept", "Most kept", "kept DESC, last_at DESC NULLS LAST"],
  ["name", "A–Z", "lower(s.name) ASC"],
] as const;
export const SHOWS = [
  ["all", "Everyone", "1 = 1"],
  ["verified", "Verified", "s.verified_at IS NOT NULL"],
  ["messages", "With messages", "lm.text IS NOT NULL"],
  ["blocked", "Blocked", "s.blocked_at IS NOT NULL"],
] as const;
export const pickSort = (key: string | undefined) => SORTS.find(([k]) => k === key) ?? SORTS[0];
export const pickShow = (key: string | undefined) => SHOWS.find(([k]) => k === key) ?? SHOWS[0];
