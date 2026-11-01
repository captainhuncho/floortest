/**
 * The rules for staff verification proof (owner, 1 Nov): every verification by staff carries a reason and proof, so
 * other teams can check it later. Proof is at least one file (a screenshot or a PDF) or at least one https link.
 * Plain data and checks, no server imports, so the browser form and the tests use the same limits.
 */

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const PROOF_FILES_MAX = 5;
export const PROOF_BYTES_MAX = 10 * 1024 * 1024;
export const PROOF_LINKS_MAX = 5;
const LINK_MAX = 500;
const NAME_MAX = 120;

export const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export type ProofMime = (typeof PROOF_TYPES)[number];
export const isProofMime = (s: string): s is ProofMime => (PROOF_TYPES as readonly string[]).includes(s);

/** What the file really is, from its first bytes; never from its name or the type the browser claimed. */
export function sniffProof(b: Uint8Array): ProofMime | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

type Checked<T> = { ok: true; value: T } | { ok: false; why: string };

export function cleanReason(raw: string): Checked<string> {
  const reason = raw.trim().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ");
  if (reason.length < REASON_MIN) return { ok: false, why: `Say why in at least ${REASON_MIN} characters, e.g. known label, matched their Instagram` };
  if (reason.length > REASON_MAX) return { ok: false, why: `Keep the reason under ${REASON_MAX} characters` };
  return { ok: true, value: reason };
}

/** Profile links, one per line (or separated by spaces or commas). Only https, no passwords in the address. */
export function cleanLinks(raw: string): Checked<string[]> {
  const parts = [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
  if (parts.length > PROOF_LINKS_MAX) return { ok: false, why: `Add at most ${PROOF_LINKS_MAX} links` };
  const links: string[] = [];
  for (const p of parts) {
    let u: URL;
    try {
      u = new URL(p);
    } catch {
      return { ok: false, why: `"${p.slice(0, 60)}" isn't a link. Paste the full address, starting https://` };
    }
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password || p.length > LINK_MAX)
      return { ok: false, why: `Use https links to a public profile ("${p.slice(0, 60)}" can't be used)` };
    links.push(u.toString());
  }
  return { ok: true, value: links };
}

/** A file's name for display only: never part of a storage key. */
export const cleanFileName = (raw: string) =>
  raw.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(-NAME_MAX) || "file";

/** Proof is required: a file, or a link. Counts are checked here, sizes and types where the bytes are. */
export function proofRefusal(files: number, links: number): string | null {
  if (files > PROOF_FILES_MAX) return `Add at most ${PROOF_FILES_MAX} files`;
  if (!files && !links) return "Add proof: a screenshot or PDF, or a link to their profile";
  return null;
}

export const sizeRefusal = (size: number) =>
  !Number.isSafeInteger(size) || size < 1 ? "That file is empty" : size > PROOF_BYTES_MAX ? `Each file must be ${PROOF_BYTES_MAX / 1024 / 1024} MB or less` : null;
