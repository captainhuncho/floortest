/**
 * The ops kit's plain rules (admin redesign B, step 1): no React, no DOM, so the unit tests can run them
 * (tests/ops-kit.test.ts). The components in this folder use them.
 */

/** The press gives feedback at once; the spinner waits this long, so a fast answer never flickers one. */
export const SPINNER_DELAY_MS = 150;
/** How long "✓ Done" stays on a button before its label comes back. */
export const DONE_HOLD_MS = 1200;
/** Toasts on screen at once; a fourth closes the oldest. */
export const TOAST_MAX = 3;
export const TOAST_MS = 6000;
export const TOAST_ERROR_MS = 8000;
/** Two-key shortcuts ("g i") must come within this long of each other. */
export const KEY_SEQUENCE_MS = 900;
/** People search in ⌘K: fewer characters than this find nobody (and never reach the server). */
export const PEOPLE_MIN_QUERY = 2;
export const PEOPLE_MAX_RESULTS = 8;

/** What a key handler needs to know about a key press, so the rule can be tested without a browser. */
export type KeyInfo = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** The press came from an input, textarea, select or editable text. */
  inField: boolean;
  /** A dialog, sheet or the palette is open. */
  dialogOpen: boolean;
  defaultPrevented?: boolean;
  /** The press came from a button, link or other control, where Space and Enter belong to the control. */
  onControl?: boolean;
};

/**
 * Whether a single-key shortcut may act on this press: never while typing, never under a dialog or the palette, never
 * with ⌘/Ctrl/Alt (those belong to the browser and to ⌘K / ⌘Z), and never on a press another handler already took.
 */
export function shortcutAllowed(k: KeyInfo) {
  if (k.defaultPrevented || k.metaKey || k.ctrlKey || k.altKey) return false;
  if (k.inField || k.dialogOpen) return false;
  // Space and Enter press the focused button or link; a shortcut on them must never take that away.
  if (k.onControl && (k.key === " " || k.key === "Enter")) return false;
  return k.key.length === 1 || k.key === "Enter" || k.key === "Escape";
}

/** A key press as the shortcut list names it: letters lower case unless Shift made them upper case. */
export const keyName = (key: string, shift = false) => (shift && key.length === 1 ? key : key.toLowerCase());

/** How the "?" list names a key: the space bar as "Space". */
export const keyLabel = (combo: string) => (combo === " " ? "Space" : combo);

/**
 * Finds the shortcut for a key, keeping two-key sequences ("g i") in mind. Returns the shortcut to run, or `pending`
 * when the key starts a sequence and the next key decides.
 */
export function matchShortcut(combos: readonly string[], key: string, pending: string, pendingAge: number) {
  const seq = pending && pendingAge < KEY_SEQUENCE_MS ? `${pending} ${key}` : key;
  if (combos.includes(seq)) return { run: seq, pending: "" };
  if (combos.some((c) => c.startsWith(`${seq} `))) return { run: null, pending: seq };
  if (seq !== key && combos.includes(key)) return { run: key, pending: "" };
  return { run: null, pending: "" };
}

/** The rows between two positions, both included, whichever comes first. */
export function between<T>(list: readonly T[], a: number, b: number): T[] {
  const [s, e] = a <= b ? [a, b] : [b, a];
  return list.slice(Math.max(0, s), e + 1);
}

/**
 * Shift-click and Shift+J/K: every row from the anchor to `index` becomes `on`, the rest keep their state. Never more
 * than `max` (the server's bulk limit): rows past it are left out rather than sent and refused.
 */
export function selectRange<T>(selected: ReadonlySet<T>, ids: readonly T[], anchor: number, index: number, on: boolean, max = Infinity): Set<T> {
  const next = new Set(selected);
  for (const id of between(ids, anchor, index)) {
    if (!on) next.delete(id);
    else if (next.size < max) next.add(id);
  }
  return next;
}

/** One row on or off, within `max`. */
export function toggleOne<T>(selected: ReadonlySet<T>, id: T, max = Infinity): Set<T> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (next.size < max) next.add(id);
  return next;
}

/**
 * The tag typed in the bulk bar, the way the server keeps it (src/lib/audience.ts cleanTags): the first word, lower
 * case, letters, digits and dashes only, at most 30 characters. Leading commas and spaces never make an empty tag.
 */
export function cleanTag(raw: string) {
  const first = String(raw)
    .split(/[,\s]+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30))
    .find(Boolean);
  return first ?? "";
}

/** "Lena, Sam and 3 more": the names a confirm shows, the first eight in full. */
export function namesShown(names: readonly string[], max = 8) {
  return { shown: names.slice(0, max), more: Math.max(0, names.length - max) };
}

/** How well a query matches a piece of text, 0 for no match: exact, then prefix, then a word start, then anywhere. */
export function matchScore(query: string, text: string | undefined | null) {
  const q = query.trim().toLowerCase();
  if (!q || !text) return 0;
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s@._/-]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return 0;
}

export type PaletteCommand = { id: string; label: string; hint?: string; keywords?: readonly string[] };

/** Commands for a query, best first. An empty query lists the first ones as they come. */
export function rankCommands<C extends PaletteCommand>(query: string, commands: readonly C[], max = 8): C[] {
  const q = query.trim().replace(/^@/, "");
  if (!q) return commands.slice(0, max);
  return commands
    .map((c) => ({ c, s: Math.max(matchScore(q, c.label), ...(c.keywords ?? []).map((k) => matchScore(q, k) - 5), matchScore(q, c.hint) - 10) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.c);
}

/** The query people search sends, or null when it is too short to search (and never leaves the browser). */
export function peopleQuery(raw: string) {
  const q = raw.trim().replace(/^@/, "").slice(0, 100);
  return q.length >= PEOPLE_MIN_QUERY ? q : null;
}

/** A held send (src/lib/mail.ts SEND_HOLD_MS): the server waits this long before the email goes. */
export const HELD_SERVER_MS = 8_000;
/** What the toast counts down ("Sending in 5 s"), well inside the server's hold. */
export const HELD_SHOWN_MS = 5_000;
/** Kept back from the end of the hold, so an Undo pressed at the last moment still reaches the server in time. */
export const HELD_MARGIN_MS = 1_000;
/** How long "Sent" stays once the Undo window has closed. */
export const HELD_SENT_MS = 2_500;

/**
 * Time left to undo a held send, in ms (0: too late, no Undo). The clock starts when the answer, and its token, reached
 * the browser. Hovering or focusing the toast (`pausedMs`) stops the count, but never past the server's hold: the
 * Undo window always closes HELD_MARGIN_MS before the email goes, however long the pause.
 */
export function heldLeft(receivedAt: number, now: number, pausedMs = 0) {
  const shown = HELD_SHOWN_MS - (now - receivedAt - Math.max(0, pausedMs));
  const hard = receivedAt + HELD_SERVER_MS - HELD_MARGIN_MS - now;
  return Math.max(0, Math.min(shown, hard, HELD_SHOWN_MS));
}

/** The whole seconds "Sending in N s" shows: 5 at the start, 1 in the last second. */
export const heldSeconds = (leftMs: number) => Math.ceil(Math.max(0, leftMs) / 1000);
