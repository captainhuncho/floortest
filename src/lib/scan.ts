import "server-only";

/**
 * Virus check of an upload, on our own scanner (ClamAV in a small container we run: `scanner/`). The scanner reads the
 * file from R2 with its own read-only key, so the file never goes to a third-party service. Off until SCAN_URL is set.
 *
 *   clean      → the upload carries on
 *   infected   → the upload is refused and discarded; the sender is told it couldn't be accepted
 *   unavailable → the upload is refused for now (fail closed): nothing unscanned reaches a desk while the scanner is on
 */
export type ScanResult = { verdict: "clean" | "off" } | { verdict: "infected"; signature: string } | { verdict: "unavailable"; error: string };

const SCAN_TIMEOUT_MS = 45_000;

export async function scanStored(key: string): Promise<ScanResult> {
  const url = process.env.SCAN_URL?.trim();
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

/** What senders are told (never the signature: that's for ops). */
export const SCAN_REFUSED = "This file couldn't be accepted: our virus check flagged it. Export the track again and send the new file.";
export const SCAN_UNAVAILABLE = "We couldn't run the virus check just now, so the file wasn't sent. Please try again in a few minutes.";
