/**
 * An email address as the private link pages show it to someone who only has the link (owner, 2 Nov): enough for the
 * person it belongs to to recognise it, too little for anyone else to read it. `maya@gmail.com` → `m•••@g•••.com`.
 * The first letter of the name, the first letter of the domain, and only the last part of the domain (`.uk` for
 * `mail.co.uk`). Anything that isn't an address shows as `•••` rather than leaking what was stored.
 */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return "•••";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const labels = domain.split(".").filter(Boolean);
  if (labels.length < 2 || /\s/.test(e)) return "•••";
  return `${first(local)}•••@${first(labels[0])}•••.${labels[labels.length - 1]}`;
}

/** The first character, counted as a whole letter (so an emoji or accented letter isn't cut in half). */
const first = (s: string) => Array.from(s)[0] ?? "";
