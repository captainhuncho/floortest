"use client";

import { useEffect, useState } from "react";
import { analyzeAudio, type Analysis } from "@/lib/analyze";
import { readTags, type Tags } from "@/lib/tags";

export const MAX_BYTES = 250 * 1024 * 1024;
const SENDER_KEY = "floortest.sender";

export type Phase = "idle" | "uploading" | "done";

/** File selection, in-browser analysis and upload. Shared by every public page style. */
export function useTrackUpload(handle: string, opts: { asAccount?: boolean } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sender, setSender] = useState({ name: "", email: "" });

  // Name and email are captured once and remembered on this device.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SENDER_KEY) || "null");
      if (s?.name || s?.email) setSender({ name: s.name || "", email: s.email || "" });
    } catch {}
  }, []);

  /** Validates and analyses a file. Resolves with tags read from it (or its filename). */
  async function pick(f: File | undefined): Promise<Tags | null> {
    setError(null);
    if (!f) return null;
    if (!/\.(wav|mp3)$/i.test(f.name)) {
      setError("Only WAV and MP3 files are accepted.");
      return null;
    }
    if (f.size > MAX_BYTES) {
      setError("That file is over 250 MB.");
      return null;
    }
    setFile(f);
    setAnalysis(null);
    setAnalyzing(true);
    const tags = await readTags(f);
    setAnalysis(await analyzeAudio(f));
    setAnalyzing(false);
    return tags;
  }

  /**
   * Three steps: ask the server for an upload URL (it checks the rules first), PUT the file
   * straight to storage with progress, then ask the server to verify it and create the track.
   */
  async function send(fd: FormData) {
    if (!file) return setError("Choose a WAV or MP3 file.");
    const field = (k: string) => String(fd.get(k) ?? "");
    try {
      if (!opts.asAccount) localStorage.setItem(SENDER_KEY, JSON.stringify({ name: field("name"), email: field("email") }));
    } catch {}
    setError(null);
    setPhase("uploading");
    setProgress(0);
    const fail = (msg: string) => {
      setError(msg);
      setPhase("idle");
    };
    const json = async (res: Response) => ((await res.json().catch(() => ({}))) as { error?: string; token?: string; uploadId?: string; target?: { url: string; headers: Record<string, string> } });

    try {
      const start = await fetch(`/api/submit/${handle}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: field("name"),
          email: field("email"),
          title: field("title"),
          artist: field("artist"),
          message: field("message"),
          genre: field("genre"),
          release_status: field("release_status"),
          mix_status: field("mix_status"),
          fileName: file.name,
          size: file.size,
          asAccount: !!opts.asAccount,
        }),
      });
      const started = await json(start);
      if (!start.ok || !started.uploadId || !started.target) return fail(started.error || "Couldn't start the upload. Please try again.");

      const put = await new Promise<number>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", started.target!.url);
        for (const [k, v] of Object.entries(started.target!.headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress((ev.loaded / ev.total) * 0.97);
        xhr.onload = () => resolve(xhr.status);
        xhr.onerror = () => resolve(0);
        xhr.send(file);
      });
      if (put < 200 || put >= 300)
        return fail(put === 0 ? "Network error. Your details are still here. Check your connection and try again." : "The upload didn't go through. Please try again.");

      const done = await fetch(`/api/submit/${handle}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: started.uploadId, duration: analysis?.duration, bpm: analysis?.bpm, peaks: analysis?.peaks }),
      });
      const finished = await json(done);
      if (!done.ok || !finished.token) return fail(finished.error || "Upload failed. Your details are still here, so you can try again.");
      setProgress(1);
      setToken(finished.token);
      setPhase("done");
    } catch {
      fail("Network error. Your details are still here. Check your connection and try again.");
    }
  }

  function reset() {
    setFile(null);
    setAnalysis(null);
    setToken(null);
    setPhase("idle");
    setError(null);
  }

  return { file, analysis, analyzing, phase, progress, error, setError, token, sender, setSender, pick, send, reset };
}
