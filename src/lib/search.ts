import "server-only";
import { asPerson, likeContains, q, type User } from "./db";

export type SearchHit = { kind: "track" | "contact"; id: number; title: string; detail: string; href: string };

/** How close a word must be to count as a typo of it (0..1, pg_trgm word similarity). 0.35 lets "hosue" find "house". */
const CLOSE_ENOUGH = "0.35";
/** Under this many characters, substring only: one letter is close to everything. */
const MIN_FUZZY = 2;
const MAX_QUERY = 100;
const MAX_TRACKS = 6;
const MAX_CONTACTS = 4;
/** A search that runs longer than this is stopped (ms), so one slow query can't hold a connection. */
const SEARCH_TIMEOUT_MS = "2000";

/** The few names the floor spells several ways. Fixed list: input only ever picks from it. */
const SYNONYMS: ReadonlyArray<ReadonlyArray<string>> = [
  ["dnb", "drum and bass", "drum & bass", "d&b"],
  ["ukg", "uk garage"],
];

/** The query plus its other spellings from SYNONYMS, matched on whole words only, at most four in all. */
export function spellings(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const padded = ` ${words.join(" ")} `;
  const out = new Set([words.join(" ")]);
  for (const group of SYNONYMS) {
    for (const name of group) {
      if (!padded.includes(` ${name} `)) continue;
      for (const other of group) if (other !== name) out.add(padded.split(` ${name} `).join(` ${other} `).trim());
    }
  }
  return [...out].slice(0, 4);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The top bar's search: a desk's own tracks and contacts that contain the words, or come close to them (typos),
 * exact and starting matches first, then the closest, then the newest. Runs under the person's database rules in one
 * transaction (threshold and a 2 s timeout set locally), and every value is bound: input never shapes the SQL beyond
 * how many spellings it has (one to four, from SYNONYMS) and whether it is long enough for the typo match.
 */
export async function searchDesk(desk: Pick<User, "id" | "actor_id">, query: string): Promise<SearchHit[]> {
  const text = String(query ?? "").trim().toLowerCase().slice(0, MAX_QUERY);
  if (!text) return [];
  const fuzzy = text.length >= MIN_FUZZY;
  const likes = spellings(text).map(likeContains);
  const starts = `${escapeLike(text)}%`;
  const anyLike = (field: string) => likes.map(() => `${field} LIKE ? ESCAPE '\\'`).join(" OR ");
  const title = "lower(t.title)", artist = "lower(t.artist)", genre = "lower(coalesce(t.genre, ''))", name = "lower(s.name)";
  const close = (field: string) => (fuzzy ? `? <% ${field} OR ` : "");
  const closeArgs = (n: number) => (fuzzy ? Array<string>(n).fill(text) : []);
  const score = (field: string) => (fuzzy ? `word_similarity(?, ${field})` : "0::real");

  return asPerson(desk.actor_id, () =>
    q.tx(async (t) => {
      await t.run(
        "SELECT set_config('pg_trgm.word_similarity_threshold', ?, true), set_config('statement_timeout', ?, true)",
        CLOSE_ENOUGH, SEARCH_TIMEOUT_MS,
      );
      const tracks = await t.all<{ id: number; title: string; artist: string; sender: string }>(
        `SELECT t.id, t.title, t.artist, s.name AS sender FROM tracks t JOIN senders s ON s.id = t.sender_id
         WHERE t.user_id = ? AND t.deleted_at IS NULL
           AND (${close(title)}${close(artist)}${close(genre)}${anyLike(title)} OR ${anyLike(artist)} OR ${anyLike(genre)})
         ORDER BY (${title} = ? OR ${artist} = ?) DESC,
                  (${title} LIKE ? ESCAPE '\\' OR ${artist} LIKE ? ESCAPE '\\') DESC,
                  GREATEST(${score(title)}, ${score(artist)}, ${score(genre)}) DESC, t.created_at DESC
         LIMIT ${MAX_TRACKS}`,
        desk.id, ...closeArgs(3), ...likes, ...likes, ...likes, text, text, starts, starts, ...closeArgs(3),
      );
      const contacts = await t.all<{ id: number; name: string; email: string }>(
        `SELECT s.id, s.name, s.email FROM senders s
         WHERE s.user_id = ? AND (${close(name)}${name} LIKE ? ESCAPE '\\' OR lower(s.email) LIKE ? ESCAPE '\\')
         ORDER BY (${name} LIKE ? ESCAPE '\\') DESC, ${score(name)} DESC, ${name}
         LIMIT ${MAX_CONTACTS}`,
        desk.id, ...closeArgs(1), likes[0], likes[0], starts, ...closeArgs(1),
      );
      return [
        ...tracks.map((r) => ({ kind: "track" as const, id: r.id, title: `${r.artist} - ${r.title}`, detail: `from ${r.sender}`, href: `/dashboard/review?view=queue&s=all&t=${r.id}` })),
        ...contacts.map((c) => ({ kind: "contact" as const, id: c.id, title: c.name, detail: c.email, href: `/dashboard/contacts/${c.id}` })),
      ];
    }),
  );
}
