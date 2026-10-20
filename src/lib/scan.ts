import "server-only";

/**
 * Virus check of an upload, on our own scanner (ClamAV in a small container we run: `scanner/`). The scanner reads the
 * file from R2 with its own read-only key, so the file never goes to a third-party service.
 *
 * On the live site (VERCEL_ENV=production) the check is required: if SCAN_URL or SCAN_SECRET is missing there, every
 * upload is refused as "unavailable" rather than accepted unscanned, and /api/health's detailed report says so
 * (Codex review, 19 Oct). Previews and local copies run without a scanner ("off"): the preview bucket isn't one the
 * scanner's key can read.
 *
 *   clean      → the upload carries on
 *   infected   → the upload is refused and discarded; the sender is told it couldn't be accepted
 *   unavailable → the upload is refused for now (fail closed): nothing unscanned reaches a desk while the scanner is on
 */
export type ScanResult = { verdict: "clean" | "off" } | { verdict: "infected"; signature: string } | { verdict: "unavailable"; error: string };

const SCAN_TIMEOUT_MS = 45_000;
const HEALTH_TIMEOUT_MS = 5_000;

/** True on the live site, where nothing may be accepted unscanned. */
export const scanRequired = () => process.env.VERCEL_ENV === "production";

/** Why scanning can't run with this configuration, or null when it's set up (or legitimately off on a preview). */
export function scanConfigProblem(): string | null {
  const url = process.env.SCAN_URL?.trim();
  const secret = process.env.SCAN_SECRET?.trim();
  if (url && !secret) return "SCAN_SECRET is not set: the scanner will refuse every check, so every upload is refused.";
  if (!url && scanRequired()) return "SCAN_URL is not set on the live site: uploads are refused until the virus scanner is configured.";
  return null;
}

export async function scanStored(key: string): Promise<ScanResult> {
  const url = process.env.SCAN_URL?.trim();
  const problem = scanConfigProblem();
  if (problem) return { verdict: "unavailable", error: "scanner not configured" };
  if (!url) return { verdict: "off" };
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SCAN_SECRET ?? ""}` },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    });
    if (!r.ok) return { verdict: "unavailable", error: `scanner answered ${r.status}` };
    const body = (await r.json()) as { clean?: boolean; signature?: string };
    if (body.clean === true) return { verdict: "clean" };
    if (body.clean === false) return { verdict: "infected", signature: String(body.signature ?? "unknown").slice(0, 120) };
    return { verdict: "unavailable", error: "scanner gave no verdict" };
  } catch (e) {
    return { verdict: "unavailable", error: e instanceof Error ? e.name : String(e) };
  }
}

/** The scanner's own health check, for /api/health's detailed report: "ok", "down", or "off" when there is none. */
export async function scannerHealth(): Promise<"ok" | "down" | "off"> {
  const url = process.env.SCAN_URL?.trim();
  if (!url) return "off";
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const body = r.ok ? ((await r.json()) as { clamd?: boolean }) : null;
    return body?.clamd === true ? "ok" : "down";
  } catch {
    return "down";
  }
}

/** What senders are told (never the signature: that's for ops). */
export const SCAN_REFUSED = "This file couldn't be accepted: our virus check flagged it. Export the track again and send the new file.";
export const SCAN_UNAVAILABLE = "We couldn't run the virus check just now, so the file wasn't sent. Please try again in a few minutes.";
