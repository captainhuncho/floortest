"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { fmtBytes, fmtTime } from "@/lib/format";
import { GenrePicker } from "./GenrePicker";
import { useTrackUpload } from "./useTrackUpload";

export function SubmitForm({ handle, receiverName, genres }: { handle: string; receiverName: string; genres: string[] }) {
  const { file, analysis, analyzing, phase, progress, error, token, sender, setSender, pick: pickFile, send, reset: resetUpload } =
    useTrackUpload(handle);
  const [drag, setDrag] = useState(false);
  const [track, setTrack] = useState({ title: "", artist: "" });
  const [genre, setGenre] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    const tags = await pickFile(f);
    if (tags) setTrack({ title: tags.title, artist: tags.artist });
  }

  function reset() {
    resetUpload();
    setTrack({ title: "", artist: "" });
    setGenre("");
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(new FormData(e.currentTarget));
  }

  if (phase === "done" && token) {
    return (
      <div className="card p-6" role="status">
        <span className="chip border-lime/50 text-lime">Delivered</span>
        <h2 className="mt-4 text-2xl font-bold">&ldquo;{track.title}&rdquo; is on {receiverName}&apos;s desk.</h2>
        <p className="mt-2 text-mute">
          We sent a receipt to {sender.email}. You&apos;ll hear from us when it&apos;s listened to, downloaded or replied to.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/t/${token}`} className="btn-lime">
            View receipt
          </Link>
          <button className="btn-ghost" onClick={reset}>
            Send another track
          </button>
        </div>
      </div>
    );
  }

  const busy = phase === "uploading";
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (!busy) pick(e.dataTransfer.files[0]);
    },
  };
  const fileInput = (
    <input
      ref={inputRef}
      id="track-file"
      type="file"
      aria-label="Choose a WAV or MP3 file"
      tabIndex={-1}
      accept=".wav,.mp3,audio/wav,audio/mpeg"
      className="sr-only"
      onChange={(e) => {
        pick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const errorBox = error && (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );

  // Step 1: the only thing asked for is the file.
  if (!file) {
    return (
      <div className="space-y-4">
        <div {...dropProps} className={`card border-dashed p-8 text-center transition ${drag ? "border-lime bg-lime/5" : ""}`}>
          {fileInput}
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-lime px-6 py-3.5 text-base">
            Choose WAV or MP3
          </button>
          <p className="mt-3 text-sm text-mute">or drag it here · up to 250 MB</p>
        </div>
        {errorBox}
      </div>
    );
  }

  // Step 2: confirm what we read from the file, then the essentials.
  return (
    <form onSubmit={submit} className="space-y-5" {...dropProps}>
      {fileInput}
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="truncate font-medium">{file.name}</p>
          {!busy && (
            <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 text-sm text-bone underline underline-offset-4">
              Change file
            </button>
          )}
        </div>
        <div className="mt-4">
          <Waveform peaks={analysis?.peaks ?? null} progress={busy ? progress : 0} height={48} dim={analyzing} />
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute tnum">
          <span>{/\.wav$/i.test(file.name) ? "WAV" : "MP3"}</span>
          <span>{fmtBytes(file.size)}</span>
          {analyzing ? (
            <span>Reading audio…</span>
          ) : analysis ? (
            <>
              <span>{fmtTime(analysis.duration)}</span>
              {analysis.bpm && <span>~{Math.round(analysis.bpm)} BPM</span>}
            </>
          ) : (
            <span>No preview in this browser. The upload still works.</span>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Track title</span>
          <input
            className="input"
            name="title"
            required
            value={track.title}
            onChange={(e) => setTrack((t) => ({ ...t, title: e.target.value }))}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Artist</span>
          <input
            className="input"
            name="artist"
            placeholder="Defaults to your name"
            value={track.artist}
            onChange={(e) => setTrack((t) => ({ ...t, artist: e.target.value }))}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Your name</span>
          <input
            className="input"
            name="name"
            required
            autoComplete="name"
            value={sender.name}
            onChange={(e) => setSender((s) => ({ ...s, name: e.target.value }))}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Your email</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={sender.email}
            onChange={(e) => setSender((s) => ({ ...s, email: e.target.value }))}
          />
          <span className="block text-sm text-mute">For your receipt and updates only.</span>
        </label>
      </div>

      <GenrePicker genres={genres} value={genre} onChange={setGenre} inputClass="input" labelClass="label" />
      <input type="hidden" name="genre" value={genre} />

      <details className="group rounded-md border border-line">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-mute hover:text-bone">
          <span className="group-open:hidden">+ Add a message or release status (optional)</span>
          <span className="hidden group-open:inline">− Message and release status</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <label className="block space-y-1.5">
            <span className="label">Message for {receiverName}</span>
            <textarea className="input min-h-24 resize-y" name="message" maxLength={2000} placeholder="Travels privately with the track." />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Release status</span>
            <select name="release_status" className="input" defaultValue="">
              <option value="">Not specified</option>
              <option value="unsigned">Unreleased demo</option>
              <option value="signed">Signed, forthcoming</option>
              <option value="released">Already released</option>
            </select>
          </label>
        </div>
      </details>

      {errorBox}

      <button className="btn-lime w-full py-3.5 text-base" disabled={busy || analyzing}>
        {busy ? `Uploading… ${Math.round(progress * 100)}%` : analyzing ? "Reading audio…" : `Send to ${receiverName}`}
      </button>
    </form>
  );
}
