import "server-only";
import { after } from "next/server";

/**
 * Virus check of an upload, on our own scanner (ClamAV in a small container we run: `scanner/`). The scanner reads the
 * file from R2 with its own read-only key, so the file never goes to a third-party service.
 *
 * On the live site (VERCEL_ENV=production) the check is required: if SCAN_URL or SCAN_SECRET is missing there, every
 * upload is refused as "unavailable" rather than accepted unscanned, and /api/health's detailed report says so
 * (Codex review, 19 Oct). Previews and local copies run without a scanner ("off"): the preview bucket isn't one the
 * scanner's key can read.
 *
 * The scanner sleeps after 10 idle minutes (owner, 26 Oct: it cost about $6.50 a month running all the time). Waking it
 * takes about 15–30 seconds (container start plus ClamAV loading its signatures), so an upload wakes it when it starts
 * (`wakeScannerSoon`), and the check waits through a wake-up: a "starting" answer or a refused connection is asked
 * again with growing pauses until the deadline. A scan that is running but slow is never cut short to retry it.
 *
 *   clean      → the upload carries on
 *   infected   → the upload is refused and discarded; the sender is told it couldn't be accepted
 *   unavailable → the upload is refused for now (fail closed): nothing unscanned reaches a desk while the scanner is on
 */
export type ScanResult = { verdict: "clean" | "off" } | { verdict: "infected"; signature: string } | { verdict: "unavailable"; error: string };

/** Longest one check may take in all, wake-up included. The upload routes allow 180 s (`maxDuration`). */
const SCAN_DEADLINE_MS = 150_000;
/** Pauses between asks while the scanner wakes: 2 s, 4 s, then every 8 s. */
const WAKE_BACKOFF_MS = [2_000, 4_000, 8_000];
const HEALTH_TIMEOUT_MS = 5_000;
const WAKE_TIMEOUT_MS = 5_000;

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

const scanBase = () => process.env.SCAN_URL?.trim().replace(/\/$/, "");

/** Timings, overridable by tests; the local end-to-end copy shortens the deadline with SCAN_DEADLINE_MS. */
export type ScanTiming = { deadlineMs?: number; backoffMs?: number[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scanStored(key: string, timing: ScanTiming = {}): Promise<ScanResult> {
  const url = scanBase();
  if (scanConfigProblem()) return { verdict: "unavailable", error: "scanner not configured" };
  if (!url) return { verdict: "off" };
  // SCAN_DEADLINE_MS (the local end-to-end copy) is a ceiling for every caller, the upload request's shorter wait included.
  const ceiling = Number(process.env.SCAN_DEADLINE_MS) || SCAN_DEADLINE_MS;
  const deadline = Date.now() + Math.min(timing.deadlineMs ?? ceiling, ceiling);
  const backoff = timing.backoffMs ?? WAKE_BACKOFF_MS;
  const pause = (attempt: number) => sleep(Math.min(backoff[Math.min(attempt, backoff.length - 1)], Math.max(0, deadline - Date.now())));
  let last = "scanner unreachable";
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) return { verdict: "unavailable", error: `${last}; gave up waiting for the scanner to wake` };
    let r: Response;
    try {
      r = await fetch(`${url}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SCAN_SECRET ?? ""}` },
        body: JSON.stringify({ key }),
        signal: AbortSignal.timeout(left),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : String(e);
      // Out of time (the scan itself or the wait for it): never "clean", and never retried past the deadline.
      if (name === "TimeoutError" || name === "AbortError") return { verdict: "unavailable", error: name };
      // Refused or dropped connection: the scanner is starting or restarting. Wait and ask again.
      last = name;
      await pause(attempt);
      continue;
    }
    // 502/503/504: the Worker is up but the container is still waking. Wait and ask again.
    if (r.status === 502 || r.status === 503 || r.status === 504) {
      last = `scanner answered ${r.status}`;
      await r.body?.cancel().catch(() => {});
      await pause(attempt);
      continue;
    }
    if (!r.ok) return { verdict: "unavailable", error: `scanner answered ${r.status}` };
    const body = (await r.json().catch(() => ({}))) as { clean?: boolean; signature?: string };
    if (body.clean === true) return { verdict: "clean" };
    if (body.clean === false) return { verdict: "infected", signature: String(body.signature ?? "unknown").slice(0, 120) };
    return { verdict: "unavailable", error: "scanner gave no verdict" };
  }
}

/**
 * Asks a sleeping scanner to start, without waiting for it. Called as an upload starts, so the scanner is usually
 * awake by the time the file has landed. Needs the secret, so nobody else can keep it running. Never throws.
 */
export async function wakeScanner(): Promise<void> {
  const url = scanBase();
  if (!url || scanConfigProblem()) return;
  try {
    const r = await fetch(`${url}/wake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SCAN_SECRET ?? ""}` },
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    await r.body?.cancel().catch(() => {});
  } catch {
    // Waking is only a head start: the check itself still waits for the scanner.
  }
}

/**
 * Whether the scanner is running right now, asked without waking it (`/status`): true, false (asleep or stopping), or
 * null when it can't tell (no scanner, an older scanner without /status, or no answer). An upload finished while it's
 * asleep is held for the next batch instead of waking it (src/lib/held-uploads.ts).
 */
export async function scannerAwake(): Promise<boolean | null> {
  const url = scanBase();
  if (!url) return null;
  try {
    const r = await fetch(`${url}/status`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const status = r.ok ? ((await r.json().catch(() => ({}))) as { container?: string }).container : undefined;
    if (!r.ok) await r.body?.cancel().catch(() => {});
    if (status === "running" || status === "healthy") return true;
    if (status === "stopped" || status === "stopped_with_code" || status === "stopping") return false;
    return null;
  } catch {
    return null;
  }
}

/** `wakeScanner` after the response has gone, so starting an upload is never slower for it. */
export function wakeScannerSoon(): void {
  if (!scanBase()) return;
  try {
    after(wakeScanner);
  } catch {
    // Outside a request (scripts, tests): just start it.
    void wakeScanner();
  }
}

/**
 * The scanner's own health check, for /api/health's detailed report: "ok", "asleep" (the Worker answers and the
 * container is stopped until the next upload wakes it: not a fault), "down", or "off" when there is none. Asking
 * `/status` first means a health check never wakes a sleeping scanner.
 */
export async function scannerHealth(): Promise<"ok" | "asleep" | "down" | "off"> {
  const url = scanBase();
  if (!url) return "off";
  try {
    const s = await fetch(`${url}/status`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const status = s.ok ? ((await s.json().catch(() => ({}))) as { container?: string }).container : undefined;
    if (status === "stopped" || status === "stopped_with_code") return "asleep";
    if (!s.ok) await s.body?.cancel().catch(() => {});
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const body = r.ok ? ((await r.json()) as { clamd?: boolean }) : null;
    return body?.clamd === true ? "ok" : "down";
  } catch {
    return "down";
  }
}

/** What senders are told (never the signature: that's for ops). */
export const SCAN_REFUSED = "This file couldn't be accepted: our virus check flagged it. Export the track again and send the new file.";
export const SCAN_UNAVAILABLE = "We couldn't finish the virus check just now, so the file wasn't sent. Please try again in a few minutes.";
