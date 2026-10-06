"use client";

import { useEffect, useState } from "react";
import { analyzeAudio, type Analysis } from "@/lib/analyze";
import { readTags, type Tags } from "@/lib/tags";

export const MAX_BYTES = 250 * 1024 * 1024;
const SENDER_KEY = "floortest.sender";

export type Phase = "idle" | "uploading" | "done";

type Fields = Record<string, unknown>;
const NET =
  "Network error. Your details are still here. Check your connection and try again.";

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
): Promise<{ token: string } | { error: string }> {
  const json = async (res: Response) =>
    (await res.json().catch(() => ({}))) as {
      error?: string;
      token?: string;
      uploadId?: string;
      target?: { url: string; headers: Record<string, string> };
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
        error: started.error || "Couldn't start the upload. Please try again.",
      };
    const put = await new Promise<number>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", started.target!.url);
      for (const [k, v] of Object.entries(started.target!.headers))
        xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) =>
        ev.lengthComputable && onProgress((ev.loaded / ev.total) * 0.97);
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(file);
    });
    if (put < 200 || put >= 300)
      return {
        error:
          put === 0 ? NET : "The upload didn't go through. Please try again.",
      };
    const done = await fetch(`/api/submit/${handle}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId: started.uploadId,
        duration: analysis?.duration,
        bpm: analysis?.bpm,
        peaks: analysis?.peaks,
      }),
    });
    const finished = await json(done);
    if (!done.ok || !finished.token)
      return {
        error:
          finished.error ||
          "Upload failed. Your details are still here, so you can try again.",
      };
    return { token: finished.token };
  } catch {
    return { error: NET };
  }
}

/** Separate tracks in one go on the send form, up to MAX_BYTES together. EPs and albums go through Send folders (paid). */
export const MAX_FILES = 3;

/** One chosen file: what we read from it (editable) and how its upload is going. */
export type Item = {
  id: string;
  file: File;
  analysis: Analysis | null;
  analyzing: boolean;
  tags: Tags;
  status: "ready" | "uploading" | "done" | "error";
  progress: number;
  token?: string;
  error?: string;
};

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b % 64]).join("");

/** Chosen files, in-browser reading and analysis, and uploads. One file is a single; several are sent as a release. */
export function useTrackUpload(handle: string, opts: { asAccount?: boolean } = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sender, setSender] = useState({ name: "", email: "" });

  // Name and email are captured once and remembered on this device.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SENDER_KEY) || "null");
      if (s?.name || s?.email) setSender({ name: s.name || "", email: s.email || "" });
    } catch {}
  }, []);

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
      if (!opts.asAccount) localStorage.setItem(SENDER_KEY, JSON.stringify({ name: field("name"), email: field("email") }));
    } catch {}
    setError(null);
    setPhase("uploading");
    const shared = {
      name: field("name"), email: field("email"), sender_links: field("sender_links"), message: field("message"), genre: field("genre"),
      release_status: field("release_status"), ai_use: field("ai_use"), mix_status: field("mix_status"), turnstile: field("cf-turnstile-response"),
      sets_ok: fd.get("sets_ok") === "on", asAccount: !!opts.asAccount,
    };
    for (const it of items) {
      if (it.status === "done") continue;
      patch(it.id, { status: "uploading", progress: 0, error: undefined });
      const r = await uploadTrack(
        handle, it.file, it.analysis,
        { ...shared, title: it.tags.title, artist: it.tags.artist, musical_key: it.tags.key, isrc: it.tags.isrc },
        (p) => patch(it.id, { progress: p }),
      );
      if ("error" in r) {
        patch(it.id, { status: "error", error: r.error });
        setError(`${it.tags.title || it.file.name}: ${r.error}`);
        setPhase("idle");
        return;
      }
      patch(it.id, { status: "done", progress: 1, token: r.token });
    }
    setPhase("done");
  }

  function reset() {
    setItems([]);
    setPhase("idle");
    setError(null);
  }

  return { items, phase, error, setError, sender, setSender, add, remove, edit, send, reset };
}
