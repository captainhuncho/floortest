/**
 * Reads what was dropped on the page: loose files and whole folders (walked through the browser's entry API, which
 * Chrome, Edge, Firefox and Safari all have). Keeps WAV and MP3 only; everything else is listed as skipped so the page
 * can say what it left out. Music-software projects (Logic, GarageBand, Ableton, FL Studio, Pro Tools, Cubase, Reaper,
 * Studio One) can't be played here: their project files and the take and sample folders beside them are skipped too,
 * so only the exported tracks come in.
 */

/** The parts of a FileSystemEntry this reads (a plain interface, so tests can hand in fakes). */
export type DropEntry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (batch: DropEntry[]) => void, fail: (e: unknown) => void) => void };
};

export type Dropped = {
  /** WAV and MP3 files, in folder order. */
  audio: File[];
  /** Names of what was left out: other files, and music-software projects (named once each). */
  skipped: string[];
  /** True when at least one skipped thing was a music-software project. */
  dawProject: boolean;
  /** The folder's name when exactly one folder (and nothing else) was dropped. */
  folder: string | null;
  /** WAV and MP3 files past the first MAX_DROP, left out so a huge drop can't freeze the tab. */
  over: number;
};

/** The most audio files one drop takes (each is read for its tags as it lands). */
export const MAX_DROP = 200;

const AUDIO = /\.(wav|mp3)$/i;
/** Project bundles that are really folders (macOS packages): skipped whole. */
const DAW_BUNDLE = /\.(logicx|logic|band)$/i;
/** Project files that sit in an ordinary folder. */
const DAW_FILE = /\.(als|alc|flp|ptx|ptf|cpr|npr|rpp|rpp-bak|song|aup3?|reason)$/i;
/** Folders a music program keeps beside its project file: samples, takes and backups, not finished tracks. */
const DAW_SIDE_FOLDERS = new Set(["samples", "ableton project info", "backup", "audio files", "audio", "media", "session file backups", "fade files", "freeze files", "edits", "plugin settings", "rendered", "video files"]);

const hidden = (name: string) => name.startsWith(".") || name === "Thumbs.db" || name === "desktop.ini";

async function children(dir: DropEntry): Promise<DropEntry[]> {
  const reader = dir.createReader!();
  const all: DropEntry[] = [];
  // readEntries hands back the folder in batches (about 100 in Chrome); an empty batch means the end.
  for (;;) {
    const batch = await new Promise<DropEntry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

/** Walks the dropped entries. Call `entriesOf` inside the drop handler first: the browser empties them after it. */
export async function readEntries(entries: DropEntry[]): Promise<Dropped> {
  const out: Dropped = { audio: [], skipped: [], dawProject: false, folder: null, over: 0 };
  const walk = async (e: DropEntry): Promise<void> => {
    if (hidden(e.name)) return;
    if (e.isDirectory) {
      if (DAW_BUNDLE.test(e.name)) {
        out.skipped.push(e.name);
        out.dawProject = true;
        return;
      }
      const inside = (await children(e)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const isProject = inside.some((c) => c.isFile && DAW_FILE.test(c.name));
      for (const c of inside) {
        if (isProject && c.isDirectory && DAW_SIDE_FOLDERS.has(c.name.toLowerCase())) continue;
        await walk(c);
      }
      return;
    }
    if (AUDIO.test(e.name)) {
      if (out.audio.length >= MAX_DROP) out.over++;
      else out.audio.push(await new Promise<File>((ok, fail) => e.file!(ok, fail)));
    }
    else {
      out.skipped.push(e.name);
      if (DAW_FILE.test(e.name)) out.dawProject = true;
    }
  };
  for (const e of entries) await walk(e);
  const visible = entries.filter((e) => !hidden(e.name));
  if (visible.length === 1 && visible[0].isDirectory && !DAW_BUNDLE.test(visible[0].name)) out.folder = visible[0].name;
  return out;
}

/** The dropped entries, taken at once (they are gone after the drop event); loose files when the browser has no entries. */
export function entriesOf(dt: DataTransfer): DropEntry[] | File[] {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.() as DropEntry | null | undefined).filter((e): e is DropEntry => !!e);
  return entries.length ? entries : [...dt.files];
}

/** Reads a drop taken with `entriesOf`. */
export async function readDrop(taken: DropEntry[] | File[]): Promise<Dropped> {
  if (taken.length && taken[0] instanceof File) {
    const files = taken as File[];
    const audio = files.filter((f) => AUDIO.test(f.name));
    return { audio: audio.slice(0, MAX_DROP), over: Math.max(0, audio.length - MAX_DROP), skipped: files.filter((f) => !AUDIO.test(f.name)).map((f) => f.name), dawProject: files.some((f) => DAW_FILE.test(f.name)), folder: null };
  }
  return readEntries(taken as DropEntry[]);
}

/** One sentence on what was left out, or "" when nothing was. */
export function skippedNote(d: Pick<Dropped, "skipped" | "dawProject"> & { over?: number }): string {
  const over = d.over ? `Took the first ${MAX_DROP} tracks; ${d.over} more left out, so drop those next.` : "";
  if (!d.skipped.length) return over;
  const names = d.skipped.slice(0, 3).join(", ") + (d.skipped.length > 3 ? ` and ${d.skipped.length - 3} more` : "");
  const what = d.skipped.length === 1 ? "1 item that isn't WAV or MP3" : `${d.skipped.length} items that aren't WAV or MP3`;
  return `Skipped ${what}: ${names}.${d.dawProject ? " Music-software projects can't be played here, so export the tracks as WAV or MP3 first." : ""}${over ? ` ${over}` : ""}`;
}

/** Said when a drop couldn't be read. */
export const DROP_FAILED = "Couldn't read what was dropped. Try again, or choose the files.";

/** True when a drag carries files (not a link or selected text being dragged). */
export const dragHasFiles = (e: { dataTransfer: DataTransfer | null }) => !!e.dataTransfer?.types.includes("Files");
