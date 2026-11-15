/**
 * A plain-text PDF, written by hand (no package: new packages are the owner's call). A4 pages, Helvetica (one of the
 * PDF standard fonts, so nothing is embedded), lines wrapped by the font's real widths, new pages as needed. Enough
 * for a stamped copy of the Terms; not a general PDF library.
 */

// Helvetica advance widths (1/1000 em) for ASCII 32–126, from the standard font metrics.
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
// The typographic characters the Terms use, as WinAnsi codes with their widths.
const EXTRA: Record<string, [number, number]> = {
  "‘": [145, 222],
  "’": [146, 222],
  "“": [147, 333],
  "”": [148, 333],
  "–": [150, 556],
  "—": [151, 1000],
  "…": [133, 1000],
  " ": [32, 278],
  "•": [149, 350],
  "é": [233, 556],
};

/** One character as a WinAnsi byte and its width; anything else becomes "?" so the file never breaks. */
function glyph(ch: string): [number, number] {
  const c = ch.codePointAt(0)!;
  if (c >= 32 && c <= 126) return [c, ASCII_WIDTHS[c - 32]];
  return EXTRA[ch] ?? [63, 556];
}

const widthOf = (s: string, size: number) => [...s].reduce((w, ch) => w + glyph(ch)[1], 0) * (size / 1000);

/** Wraps one paragraph to `max` points wide (a word longer than a line is broken). */
export function wrap(text: string, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (widthOf(next, size) <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (widthOf(rest, size) > max) {
      let cut = rest.length - 1;
      while (cut > 1 && widthOf(rest.slice(0, cut), size) > max) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

/** A PDF string literal: WinAnsi bytes, with ( ) \ escaped and anything outside ASCII written in octal. */
function literal(s: string) {
  let out = "(";
  for (const ch of s) {
    const [b] = glyph(ch);
    if (b === 40 || b === 41 || b === 92) out += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) out += `\\${b.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(b);
  }
  return `${out})`;
}

export type PdfLine = { text: string; bold?: boolean; size?: number; gap?: number };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;

/** Lays out the blocks (each a paragraph) over as many A4 pages as needed and returns the PDF bytes. */
export function textPdf(blocks: PdfLine[], title: string): Buffer {
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const b of blocks) {
    const size = b.size ?? 10;
    const lead = size * 1.4;
    y -= b.gap ?? 0;
    for (const line of wrap(b.text, size, PAGE_W - 2 * MARGIN)) {
      if (y - lead < MARGIN) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= lead;
      pages[pages.length - 1].push(`BT /${b.bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(2)} Td ${literal(line)} Tj ET`);
    }
  }
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const ops of pages) {
    const content = ops.join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${literal(title)} /Producer (FloorTest) >>`);
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
