import "server-only";
import { textPdf, type PdfLine } from "./pdf-text";
import { archivedTerms, type Acceptance } from "./terms-record";

/** "2026-11-15 09:04 UTC": the acceptance time as the stamp shows it. */
export const utcStamp = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The stamp line (Research brief): who, which email, when (UTC) and which Terms version. No initials, no IP. */
export const stampLine = (a: Pick<Acceptance, "name" | "version" | "accepted_at">, email: string) =>
  `Accepted by ${a.name || email}, ${email}, ${utcStamp(a.accepted_at)}, Terms version ${a.version}`;

/** A stamped PDF of the exact Terms text this acceptance points at, or null if that text isn't archived. */
export async function acceptedTermsPdf(a: Acceptance, email: string) {
  const terms = await archivedTerms(a.hash);
  if (!terms) return null;
  const [title, ...rest] = terms.body.split("\n");
  const blocks: PdfLine[] = [
    { text: stampLine(a, email), bold: true, size: 10 },
    { text: `Text fingerprint (SHA-256): ${a.hash}`, size: 8, gap: 2 },
    { text: title, bold: true, size: 16, gap: 18 },
  ];
  // The archived body keeps blank lines between sections; the line after a blank is the section heading.
  let heading = false;
  for (const line of rest) {
    if (!line) {
      heading = true;
      continue;
    }
    blocks.push(heading ? { text: line, bold: true, size: 11, gap: 10 } : { text: line, size: 10, gap: 4 });
    heading = false;
  }
  return textPdf(blocks, `${title}, accepted ${utcStamp(a.accepted_at)}`);
}
