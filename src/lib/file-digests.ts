import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { recordIncident } from "./incidents";
import { storage, type Storage } from "./storage";
import { expectedFiles } from "./storage-audit";

/**
 * File fingerprints (Codex review, phase B item 1, 24 Oct). Every stored file the database points to gets a SHA-256
 * and byte size computed by the server from its own copy: images from the bytes it just made, audio and stems by
 * reading the sealed file back from storage (never a figure the sender's browser sent). No row means "not checked yet";
 * a fingerprint is never made up from metadata.
 *
 * Nightly (`runDigests`): fingerprints files that have none yet (new uploads that missed it, and everything from before
 * this change), then re-reads the longest-unchecked ones and compares. A file that changed or vanished is marked
 * `mismatch` or `missing`: it's quarantined (src/lib/file-access.ts refuses it) and an urgent incident is raised.
 * Bounded by a time budget, so it never holds up the rest of the nightly job; what's left goes next night.
 */
export type DigestStatus = "ok" | "mismatch" | "missing";

const sha256 = () => crypto.createHash("sha256");

/** Reads a stored file through once and returns its fingerprint and size, or null if it isn't there. */
export async function digestStored(store: Storage, key: string): Promise<{ sha256: string; size: number } | null> {
  if (!(await store.head(key))) return null;
  const { body } = await store.stream(key);
  const h = sha256();
  let size = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    h.update(value);
    size += value.byteLength;
  }
  return { sha256: h.digest("hex"), size };
}

const insert = (key: string, digest: string, size: number, at: number, status: DigestStatus) =>
  q.run(
    "INSERT INTO file_digests (file_key, sha256, size, checked_at, status) VALUES (?, ?, ?, ?, ?) ON CONFLICT (file_key) DO NOTHING",
    key,
    digest,
    size,
    at,
    status,
  );

/** For a file the server just made in memory (cover, artwork, site image): fingerprinted from those exact bytes. */
export const recordDigest = (key: string, bytes: Uint8Array, at = now()) => insert(key, sha256().update(bytes).digest("hex"), bytes.byteLength, at, "ok");

/** For a file already in storage (sender audio, stems): read back and fingerprinted. Failures wait for the nightly run. */
export async function recordStoredDigest(key: string, at = now()) {
  try {
    const d = await digestStored(await storage(), key);
    if (d) await insert(key, d.sha256, d.size, at, "ok");
  } catch (e) {
    console.error("[file-digests] fingerprint failed; the nightly run will retry", e);
  }
}

/** A file whose bytes no longer match its fingerprint, or that has gone, is held back from playback and download. */
export async function quarantined(key: string) {
  return !!(await q.get("SELECT 1 FROM file_digests WHERE file_key = ? AND status <> 'ok'", key));
}

/** Nightly: fingerprint what has none, then re-check the longest-unchecked. Returns counts for the job log. */
export async function runDigests(budgetMs = 60_000, at = now()) {
  const until = Date.now() + budgetMs;
  const store = await storage();
  const files = (await expectedFiles()).filter((f) => f.kind !== "database backup");
  const expected = new Map(files.map((f) => [f.key, f]));
  const known = await q.all<{ file_key: string; sha256: string; size: number; status: DigestStatus }>(
    "SELECT file_key, sha256, size, status FROM file_digests ORDER BY checked_at",
  );
  // Rows for files the database no longer points to (deleted since) are dropped, never reported.
  const gone = known.filter((k) => !expected.has(k.file_key)).map((k) => k.file_key);
  for (let i = 0; i < gone.length; i += 500) {
    const part = gone.slice(i, i + 500);
    await q.run(`DELETE FROM file_digests WHERE file_key IN (${part.map(() => "?").join(",")})`, ...part);
  }
  const have = new Set(known.map((k) => k.file_key));
  const fresh = files.filter((f) => !have.has(f.key));

  let added = 0;
  let checked = 0;
  const bad: { kind: string; status: DigestStatus }[] = [];
  for (const f of fresh) {
    if (Date.now() > until) break;
    const d = await digestStored(store, f.key).catch(() => undefined);
    if (d === undefined) continue; // storage hiccup: next night
    // The database already knew this file's size: a different size means it changed before it was ever fingerprinted.
    const status: DigestStatus = !d ? "missing" : f.size !== null && f.size !== d.size ? "mismatch" : "ok";
    await insert(f.key, d?.sha256 ?? "", d?.size ?? 0, at, status);
    if (status !== "ok") bad.push({ kind: f.kind, status });
    added++;
  }
  for (const k of known) {
    if (Date.now() > until) break;
    if (!expected.has(k.file_key) || k.status !== "ok") continue;
    const d = await digestStored(store, k.file_key).catch(() => undefined);
    if (d === undefined) continue;
    const status: DigestStatus = !d ? "missing" : d.sha256 !== k.sha256 || d.size !== Number(k.size) ? "mismatch" : "ok";
    await q.run("UPDATE file_digests SET checked_at = ?, status = ? WHERE file_key = ?", at, status, k.file_key);
    if (status !== "ok") bad.push({ kind: expected.get(k.file_key)!.kind, status });
    checked++;
  }
  // File names stay out of the alert (they can carry a sender's title); ops looks them up in file_digests.
  if (bad.length)
    await recordIncident(
      "server_error",
      `${bad.length} stored file${bad.length === 1 ? "" : "s"} failed the fingerprint check and ${bad.length === 1 ? "is" : "are"} held back`,
      bad.map((b) => `${b.kind}: ${b.status}`).join("\n"),
      "/api/cron/purge",
      { urgent: true },
    );
  return { fingerprinted: added, rechecked: checked, failed: bad.length, unchecked: fresh.length - added };
}
