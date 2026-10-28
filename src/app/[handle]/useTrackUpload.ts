"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeAudio, type Analysis } from "@/lib/analyze";
import { readTags, type Tags } from "@/lib/tags";
import { MAX_BATCH_TRACKS } from "@/lib/plans";
import { stored, useBrowserValue } from "@/components/useBrowserValue";

export const MAX_BYTES = 250 * 1024 * 1024;
export const SENDER_KEY = "floortest.sender";

export type Phase = "idle" | "uploading" | "done";

type Fields = Record<string, unknown>;
export const CANCELLED = "Transfer cancelled.";
const NET =
  "Network error. Your details are still here. Check your connection and try again.";
const STALLED = "The upload stalled. Check your signal and press Send again: your details are still here.";

/** No progress for this long and the upload counts as stalled (a phone between masts often hangs rather than failing). */
export const STALL_MS = 30_000;
/** Times a dropped or stalled file is tried again by itself before the sender is asked to. */
export const RETRIES = 3;

/** Waits until the browser says it's online (or right away if it already is), then a short pause. Gives up on abort. */
function backOnline(waitMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const go = () => setTimeout(resolve, waitMs);
    if (signal?.aborted) return resolve();
    if (typeof navigator === "undefined" || navigator.onLine) return go();
    const on = () => (window.removeEventListener("online", on), go());
    window.addEventListener("online", on);
    signal?.addEventListener("abort", () => (window.removeEventListener("online", on), resolve()), { once: true });
  });
}

/**
 * One PUT of the whole file, with a stall watchdog: if no bytes move for STALL_MS (and no answer comes back),
 * the request is stopped and reported as stalled. Resolves the HTTP status, 0 for a network failure, -1 for a
 * cancel and -2 for a stall.
 */
function putFile(target: { url: string; headers: Record<string, string> }, file: File, onProgress: (p: number) => void, signal?: AbortSignal) {
  return new Promise<number>((resolve) => {
    const xhr = new XMLHttpRequest();
    let last = Date.now();
    let stalled = false;
    const watch = setInterval(() => {
      if (Date.now() - last < STALL_MS) return;
      stalled = true;
      xhr.abort();
    }, 2_000);
    const end = (v: number) => (clearInterval(watch), resolve(v));
    xhr.open("PUT", target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (ev) => {
      last = Date.now();
      if (ev.lengthComputable) onProgress((ev.loaded / ev.total) * 0.97);
    };
    xhr.onload = () => end(xhr.status);
    xhr.onerror = () => end(0);
    xhr.onabort = () => end(stalled ? -2 : -1);
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Optional extras for one upload. */
export type UploadOptions = {
  /** True once the file has landed and the server is checking it (virus check included, usually a few seconds). */
  onChecking?: (checking: boolean) => void;
};

/**
 * What one upload ended as: a track (its receipt token), held (stored, waiting for the next virus-check batch while
 * the scanner sleeps; the track and its receipt email follow within about 10 minutes), or an error to show.
 */
export type UploadResult = { token: string } | { held: true } | { error: string };

/**
 * One track, three steps: ask the server for an upload URL (it checks the rules first), PUT the file
 * straight to storage with progress, then ask the server to verify it and create the track.
 * Called once per file; several files sent together share a release.
 */
export async function uploadTrack(
  handle: string,
  file: File,
  analysis: Analysis | null,
  fields: Fields,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
  onRetry?: (attempt: number, of: number) => void,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const json = async (res: Response) =>
    (await res.json().catch(() => ({}))) as {
      error?: string;
      token?: string;
      held?: boolean;
      uploadId?: string;
      target?: { url: string; headers: Record<string, string> };
    };

  /** Step 3: verify the stored file (virus check included) and make the track. */
  const complete = async (uploadId: string): Promise<UploadResult> => {
    const ask = () =>
      fetch(`/api/submit/${handle}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, duration: analysis?.duration, bpm: analysis?.bpm, peaks: analysis?.peaks }),
      });
    // The connection dropped before the answer came back: ask again with the same upload, which the server answers with
    // the track it already made (never a second one), so a phone losing signal here doesn't make the sender resend.
    const finish = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await ask();
        } catch (e) {
          if (attempt > RETRIES || signal?.aborted) throw e;
          await backOnline(attempt * 3_000, signal);
        }
      }
    };
    opts.onChecking?.(true);
    try {
      const done = await finish();
      const finished = await json(done);
      // 202: the virus scanner is asleep, so the stored file waits for the next check (src/lib/held-uploads.ts).
      if (done.status === 202 && finished.held) return { held: true };
      if (done.ok && finished.token) return { token: finished.token };
      return { error: finished.error || "Upload failed. Your details are still here, so you can try again." };
    } finally {
      opts.onChecking?.(false);
    }
  };

  try {
    const start = await fetch(`/api/submit/${handle}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, fileName: file.name, size: file.size }),
    });
    const started = await json(start);
    if (!start.ok || !started.uploadId || !started.target)
      return {
        error: started.error || "Couldn't start the upload. Nothing was sent. Try again in a minute: your details are still here.",
      };
    // A dropped or stalled connection is tried again by itself (from the start of the file, with the same
    // upload link, which stays valid for 15 minutes), once the phone is back online.
    let put = await putFile(started.target, file, onProgress, signal);
    for (let attempt = 1; (put === 0 || put === -2) && attempt <= RETRIES && !signal?.aborted; attempt++) {
      onRetry?.(attempt, RETRIES);
      await backOnline(attempt * 3_000, signal);
      if (signal?.aborted) break;
      onProgress(0);
      put = await putFile(started.target, file, onProgress, signal);
    }
    onRetry?.(0, RETRIES);
    if (put === -1 || signal?.aborted) return { error: CANCELLED };
    if (put < 200 || put >= 300)
      return {
        error: put === -2 ? STALLED : put === 0 ? NET : "The upload didn't go through. Please try again.",
      };
    return await complete(started.uploadId);
  } catch {
    return { error: NET };
  }
}

/** Uploads artwork as-is, straight to storage, then asks the server to check it. Says whether it stuck; a failure never undoes the track. */
export async function sendArtwork(token: string, file: File): Promise<boolean> {
  try {
    const url = `/api/track-art/${encodeURIComponent(token)}`;
    const post = (body: object) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const start = (await (await post({ type: file.type, size: file.size })).json().catch(() => ({}))) as { target?: { url: string; headers: Record<string, string> } };
    if (!start.target) return false;
    const put = await fetch(start.target.url, { method: "PUT", headers: start.target.headers, body: file });
    return put.ok && (await post({ done: true })).ok;
  } catch {
    return false;
  }
}

/** Separate tracks in one go on the send form, up to MAX_BYTES together. EPs and albums go through Send folders (paid). */
export const MAX_FILES = MAX_BATCH_TRACKS;

/** One chosen file: what we read from it (editable) and how its upload is going. */
export type Item = {
  id: string;
  file: File;
  analysis: Analysis | null;
  analyzing: boolean;
  tags: Tags;
  status: "ready" | "uploading" | "done" | "error";
  progress: number;
  /** Set while a dropped or stalled upload is being tried again by itself: which try, out of how many. */
  retry?: { attempt: number; of: number };
  /** Set while the file has landed and the server is checking it. */
  checking?: boolean;
  /** Received and stored, waiting for the next virus-check batch: the track and its receipt email follow. */
  held?: boolean;
  token?: string;
  error?: string;
};

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b % 64]).join("");

/** Chosen files, in-browser reading and analysis, and uploads. One file is a single; several are sent as a release. */
export function useTrackUpload(handle: string, opts: { asAccount?: boolean } = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sender, setSender] = useState({ name: "", email: "", instagram: "", streaming: "" });
  // True when complete details came from this device (the form can show them as one line).
  const [remembered, setRemembered] = useState(false);
  // Optional artwork that didn't make it (the tracks themselves were sent); said on the done screen.
  const [artFailed, setArtFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // When the current transfer started, for the time-left estimate.
  const [startedAt, setStartedAt] = useState(0);
  // One send = one batch; a retry after a failure stays in it.
  const [batch, setBatch] = useState(newId);

  // Name, email and profiles are captured once and remembered on this device, so the next send is just the file.
  const saved = useBrowserValue(() => stored(SENDER_KEY), "");
  const [loaded, setLoaded] = useState("");
  if (saved !== loaded) {
    setLoaded(saved);
    try {
      const s = JSON.parse(saved || "null");
      if (s?.name || s?.email) {
        setSender({ name: s.name || "", email: s.email || "", instagram: s.instagram || "", streaming: s.streaming || "" });
        setRemembered(!!(s.name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email || "") && (s.instagram || s.streaming)));
      }
    } catch {}
  }

  // Leaving or reloading mid-upload would drop the transfer: the browser asks first, until it's sent or has failed.
  useEffect(() => {
    if (phase !== "uploading") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));

  /** Adds files: checks each, then reads its details and analyses its audio in the background. */
  function add(files: FileList | File[] | null | undefined) {
    setError(null);
    const chosen = Array.from(files ?? []);
    if (!chosen.length) return;
    const bad = chosen.find((f) => !/\.(wav|mp3)$/i.test(f.name));
    if (bad) return setError(`"${bad.name}" isn't a WAV or MP3.`);
    const big = chosen.find((f) => f.size > MAX_BYTES);
    if (big) return setError(`"${big.name}" is over 250 MB.`);
    const room = MAX_FILES - items.length;
    if (chosen.length > room) return setError(`Up to ${MAX_FILES} tracks at a time.`);
    const total = [...items.map((i) => i.file), ...chosen].reduce((n, f) => n + f.size, 0);
    if (total > MAX_BYTES) return setError("Your tracks add up to more than 250 MB. Send fewer, or use MP3s.");
    const fresh: Item[] = chosen.map((file) => ({
      id: newId(), file, analysis: null, analyzing: true, status: "ready", progress: 0,
      tags: { title: file.name.replace(/\.(wav|mp3)$/i, ""), artist: "", album: "", trackNo: null, bpm: null, key: "", isrc: "" },
    }));
    setItems((list) => [...list, ...fresh]);
    for (const it of fresh) {
      readTags(it.file).then((tags) => patch(it.id, { tags }));
      analyzeAudio(it.file).then((analysis) => patch(it.id, { analysis, analyzing: false }), () => patch(it.id, { analyzing: false }));
    }
  }

  const remove = (id: string) => setItems((list) => list.filter((it) => it.id !== id));
  const edit = (id: string, t: Partial<Tags>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, tags: { ...it.tags, ...t } } : it)));

  /** Sends every file not yet sent, one after another, each as its own track. */
  async function send(fd: FormData) {
    if (!items.length) return setError("Choose a WAV or MP3 file.");
    const field = (k: string) => String(fd.get(k) ?? "");
    try {
      if (!opts.asAccount) localStorage.setItem(SENDER_KEY, JSON.stringify({ name: field("name"), email: field("email"), instagram: field("sender_instagram"), streaming: field("sender_streaming") }));
    } catch {}
    setError(null);
    setArtFailed(false);
    setPhase("uploading");
    setStartedAt(Date.now());
    abort.current = new AbortController();
    const shared = {
      name: field("name"), email: field("email"), sender_instagram: field("sender_instagram"), sender_streaming: field("sender_streaming"), message: field("message"), genre: field("genre"),
      release_status: field("release_status"), ai_use: field("ai_use"), mix_status: field("mix_status"),
      sets_ok: fd.get("sets_ok") === "on", asAccount: !!opts.asAccount,
    };
    let sentCount = items.filter((x) => x.status === "done").length;
    for (const it of items) {
      if (it.status === "done") continue;
      patch(it.id, { status: "uploading", progress: 0, error: undefined });
      const r = await uploadTrack(
        handle, it.file, it.analysis,
        { ...shared, batch, title: it.tags.title, artist: it.tags.artist, musical_key: it.tags.key, isrc: it.tags.isrc },
        (p) => patch(it.id, { progress: p }),
        abort.current.signal,
        (attempt, of) => patch(it.id, { retry: attempt ? { attempt, of } : undefined }),
        { onChecking: (checking) => patch(it.id, { checking }) },
      );
      if ("error" in r && r.error === CANCELLED) {
        patch(it.id, { status: "ready", progress: 0 });
        setError(sentCount > 0 ? "Transfer cancelled. Tracks already sent are on the desk; the rest weren't sent." : "Transfer cancelled. Nothing was sent.");
        setPhase("idle");
        return;
      }
      if ("error" in r) {
        patch(it.id, { status: "error", error: r.error });
        setError(`${it.tags.title || it.file.name}: ${r.error}`);
        setPhase("idle");
        return;
      }
      if ("held" in r) {
        // Stored and waiting for its virus check. Artwork needs the track, so it can't go with this one.
        patch(it.id, { status: "done", progress: 1, held: true });
        sentCount++;
        const art = fd.get("artwork");
        if (art instanceof File && art.size) setArtFailed(true);
        continue;
      }
      patch(it.id, { status: "done", progress: 1, token: r.token });
      sentCount++;
      // Optional artwork goes with each track; the track is already sent, so a failed image never undoes that.
      const art = fd.get("artwork");
      if (art instanceof File && art.size && !(await sendArtwork(r.token, art))) setArtFailed(true);
    }
    setPhase("done");
  }

  function reset() {
    setItems([]);
    setBatch(newId());
    setPhase("idle");
    setError(null);
  }

  const cancel = () => abort.current?.abort();

  return { items, phase, error, setError, sender, setSender, remembered, artFailed, add, remove, edit, send, reset, cancel, startedAt };
}
