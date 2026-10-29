/**
 * The one rule for an email address, wherever one is typed or arrives: compatibility forms folded (NFKC, so a
 * full-width "Ａ" or the Kelvin sign is the plain letter), spaces trimmed, then lowercased. Stored emails are written
 * this way, so lookups compare like with like instead of mixing JavaScript and Postgres lowercasing.
 */
export const normalEmail = (s: string) => s.normalize("NFKC").trim().toLowerCase();
