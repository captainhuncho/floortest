import "server-only";
import fs from "node:fs";
import path from "node:path";

/** Which Chinese, Japanese or Korean font a card uses. A card only ever loads one. */
export type CjkFont = "jp" | "kr" | "sc" | "tc";
export type Layout = { body: string; width: number; lines: number; glyphs: { file: string; id: number }[] };
type LayoutOptions = { house: string; size: number; width?: number; maxLines?: number; cjk?: CjkFont };
type Run = { text: string; file: string; rtl: boolean };

const FONT_DIR = path.join(process.cwd(), "src/lib/callout-card/fonts");
const noto = (file: string) => path.join(FONT_DIR, file);
const LATIN = noto("NotoSans-Regular.ttf");
const CJK_FILES: Record<CjkFont, string> = {
  jp: noto("NotoSansJP-Regular.otf"),
  kr: noto("NotoSansKR-Regular.otf"),
  sc: noto("NotoSansSC-Regular.otf"),
  tc: noto("NotoSansTC-Regular.otf"),
};
// A fixed map: a font path is never built from anything a person typed.
const SCRIPT_FILES: [RegExp, string][] = [
  [/\p{Script=Arabic}/u, noto("NotoSansArabic-Regular.ttf")],
  [/\p{Script=Hebrew}/u, noto("NotoSansHebrew-Regular.ttf")],
  [/\p{Script=Devanagari}/u, noto("NotoSansDevanagari-Regular.ttf")],
  [/\p{Script=Bengali}/u, noto("NotoSansBengali-Regular.ttf")],
  [/\p{Script=Tamil}/u, noto("NotoSansTamil-Regular.ttf")],
  [/\p{Script=Thai}/u, noto("NotoSansThai-Regular.ttf")],
];
const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const JOINERS = /[\p{M}‌‍]/u;
const MAX_FILES_PER_STRING = 2;
const MAX_GLYPHS = 400;
const MAX_PATH_CHARS = 600_000;
const STACKED_MARKS = /\p{M}{5,}/u;
/** Noto's tall scripts need more headroom than the card's own fonts, inside the same line box. */
const FALLBACK_SCALE = 0.88;
const LINE_HEIGHT = 1.28;
const BASELINE = 0.98;
const TEXT_BLEED = 8;

type HarfBuzz = typeof import("harfbuzzjs");
let loading: Promise<HarfBuzz> | undefined;
const harfbuzz = () => (loading ??= import("harfbuzzjs"));

class Undrawable extends Error {}

/**
 * The library frees its objects only on garbage collection, so nothing is made per request: one font per
 * committed file (a fixed, small set) and one buffer. Shaping is synchronous, so requests can't interleave.
 */
const opened = new Map<string, { font: InstanceType<HarfBuzz["Font"]>; upem: number }>();
let sharedBuffer: InstanceType<HarfBuzz["Buffer"]> | undefined;

function open(hb: HarfBuzz, file: string) {
  let entry = opened.get(file);
  if (!entry) {
    const face = new hb.Face(new hb.Blob(fs.readFileSync(file)));
    entry = { font: new hb.Font(face), upem: face.upem };
    opened.set(file, entry);
  }
  return entry;
}

function shape(hb: HarfBuzz, run: Run) {
  const { font, upem } = open(hb, run.file);
  const buffer = (sharedBuffer ??= new hb.Buffer());
  buffer.reset();
  buffer.addText(run.text);
  buffer.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const glyphs = buffer.getGlyphInfosAndPositions().map((g) => ({ id: g.codepoint, x: g.xOffset ?? 0, y: g.yOffset ?? 0, advance: g.xAdvance ?? 0 }));
  if (glyphs.some((g) => g.id === 0)) throw new Undrawable();
  return { file: run.file, font, upem, glyphs };
}

const fileForScript = (ch: string, cjk: CjkFont) => (CJK_SCRIPT.test(ch) ? CJK_FILES[cjk] : SCRIPT_FILES.find(([re]) => re.test(ch))?.[1]);

/** Splits one line into runs that each have one font and one direction, in reading order. */
function splitRuns(hb: HarfBuzz, line: string, paragraphRtl: boolean, cjk: CjkFont) {
  const covers = (file: string, ch: string) => !!open(hb, file).font.nominalGlyph(ch.codePointAt(0)!);
  const lineFile = [...line].map((ch) => fileForScript(ch, cjk)).find(Boolean);
  const runs: Run[] = [];
  for (const ch of line) {
    const prev = runs.at(-1);
    if (prev && JOINERS.test(ch)) {
      runs[runs.length - 1] = { ...prev, text: prev.text + ch };
      continue;
    }
    const scripted = fileForScript(ch, cjk);
    const isDigit = /\p{N}/u.test(ch);
    const isLetter = /\p{L}/u.test(ch);
    const file = scripted ?? (isLetter ? LATIN : ([prev?.file, lineFile, LATIN].find((f) => f && covers(f, ch)) ?? LATIN));
    const rtl = scripted ? RTL.test(ch) : isDigit || isLetter ? false : (prev?.rtl ?? paragraphRtl);
    if (prev && prev.file === file && prev.rtl === rtl) runs[runs.length - 1] = { ...prev, text: prev.text + ch };
    else runs.push({ text: ch, file, rtl });
  }
  if (new Set(runs.map((r) => r.file)).size > MAX_FILES_PER_STRING) throw new Undrawable();
  return paragraphRtl ? rightToLeftOrder(runs) : runs;
}

/** Right-to-left text reverses its runs, but a stretch of numbers or Latin between them keeps its own order. */
function rightToLeftOrder(runs: Run[]) {
  const groups: Run[][] = [];
  for (const run of runs) {
    const last = groups.at(-1);
    if (last && !run.rtl && !last[0].rtl) last.push(run);
    else groups.push([run]);
  }
  return groups.reverse().flat();
}

const graphemes = (text: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);

/** Cuts on whole characters, so a joined letter or accent is never split. */
export function shortenGraphemes(text: string, max: number) {
  const all = graphemes(text);
  return all.length > max ? `${all.slice(0, max - 1).join("").trimEnd()}…` : text;
}

function wrapLines(text: string, fits: (t: string) => boolean) {
  const lines: string[] = [];
  let line = "";
  const add = (piece: string, joiner: string) => {
    const next = line ? `${line}${joiner}${piece}` : piece;
    if (fits(next)) line = next;
    else {
      if (line) lines.push(line);
      line = piece;
    }
  };
  for (const word of text.split(" ")) {
    if (fits(word)) add(word, " ");
    else for (const piece of graphemes(word)) add(piece, "");
  }
  return line ? [...lines, line] : lines;
}

function place(hb: HarfBuzz, text: string, opts: LayoutOptions, runsFor: (line: string) => Run[], size: number): Layout {
  const measure = (line: string) => runsFor(line).reduce((sum, run) => {
    const s = shape(hb, run);
    return sum + s.glyphs.reduce((w, g) => w + g.advance, 0) * (size / s.upem);
  }, 0);
  const wrapped = opts.width ? wrapLines(text, (t) => measure(t) <= opts.width!) : [text];
  const lines = opts.maxLines ? wrapped.slice(0, opts.maxLines) : wrapped;
  const lineHeight = Math.ceil(opts.size * LINE_HEIGHT);
  const placedGlyphs: Layout["glyphs"] = [];
  let body = "";
  let widest = 1;
  lines.forEach((line, index) => {
    let cursor = 0;
    for (const run of runsFor(line)) {
      const shaped = shape(hb, run);
      const scale = size / shaped.upem;
      for (const g of shaped.glyphs) {
        placedGlyphs.push({ file: shaped.file, id: g.id });
        const d = shaped.font.glyphToPath(g.id);
        const x = (cursor + g.x * scale).toFixed(2);
        const y = (Math.round(opts.size * BASELINE) + index * lineHeight - g.y * scale).toFixed(2);
        if (d) body += `<path transform="translate(${x} ${y}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>`;
        cursor += g.advance * scale;
      }
    }
    widest = Math.max(widest, cursor);
  });
  if (placedGlyphs.length > MAX_GLYPHS || body.length > MAX_PATH_CHARS) throw new Undrawable();
  return { body, width: Math.ceil(widest) + TEXT_BLEED, lines: lines.length, glyphs: placedGlyphs };
}

/**
 * Shapes text into font-outline paths: the card's own font when it has every glyph, otherwise the Noto font
 * for each script. Null when it can't be drawn cleanly, so the caller uses the handle or leaves the field out.
 */
export async function layoutText(text: string, opts: LayoutOptions): Promise<Layout | null> {
  if (STACKED_MARKS.test(text)) return null;
  const hb = await harfbuzz();
  try {
    return place(hb, text, opts, (line) => [{ text: line, file: opts.house, rtl: false }], opts.size);
  } catch (error) {
    if (!(error instanceof Undrawable)) throw error;
  }
  try {
    const firstStrong = [...text].find((ch) => /\p{L}/u.test(ch));
    const paragraphRtl = !!firstStrong && RTL.test(firstStrong);
    return place(hb, text, opts, (line) => splitRuns(hb, line, paragraphRtl, opts.cjk ?? "sc"), opts.size * FALLBACK_SCALE);
  } catch (error) {
    if (error instanceof Undrawable) return null;
    throw error;
  }
}
