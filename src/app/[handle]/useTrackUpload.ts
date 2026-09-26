"use client";

import { useEffect, useState } from "react";
import { analyzeAudio, type Analysis } from "@/lib/analyze";
import { readTags, type Tags } from "@/lib/tags";

export const MAX_BYTES = 250 * 1024 * 1024;
const SENDER_KEY = "floortest.sender";

export type Phase = "idle" | "uploading" | "done";

/** File selection, in-browser analysis and upload. Shared by every public page style. */
export function useTrackUpload(handle: string) {
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

  function send(fd: FormData) {
    if (!file) return setError("Choose a WAV or MP3 file.");
    fd.set("file", file);
    if (analysis) {
      fd.set("duration", String(analysis.duration));
      fd.set("peaks", JSON.stringify(analysis.peaks));
      if (analysis.bpm) fd.set("bpm", String(analysis.bpm));
    }
    try {
      localStorage.setItem(SENDER_KEY, JSON.stringify({ name: fd.get("name"), email: fd.get("email") }));
    } catch {}

    setError(null);
    setPhase("uploading");
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/submit/${handle}`);
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(ev.loaded / ev.total);
    xhr.onload = () => {
      let body: { token?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && body.token) {
        setToken(body.token);
        setPhase("done");
      } else {
        setError(body.error || "Upload failed. Your details are still here, so you can try again.");
        setPhase("idle");
      }
    };
    xhr.onerror = () => {
      setError("Network error. Your details are still here. Check your connection and try again.");
      setPhase("idle");
    };
    xhr.send(fd);
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
