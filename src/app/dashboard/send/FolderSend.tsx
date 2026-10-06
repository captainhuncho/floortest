"use client";

import { useRef, useState } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { fmtBytes } from "@/lib/format";
import { readTags } from "@/lib/tags";
import { MAX_BYTES, uploadTrack } from "../../[handle]/useTrackUpload";

type Item = { file: File; title: string; artist: string; state: "waiting" | "sending" | "sent" | "failed"; progress: number; error?: string };

const audio = (f: File) => /\.(wav|mp3)$/i.test(f.name);
const batchId = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b % 64]).join("");

/**
 * Send folders (paid plans): pick a folder or several files, up to 250 MB in total. Each file goes
 * through the same checks as a single track, one after another, all under one batch id so the
 * receiver sees them as one folder.
 */
export function FolderSend({ handle, receiverName, genres }: { handle: string; receiverName: string; genres: string[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [genre, setGenre] = useState("");
  const [message, setMessage] = useState("");
  const [setsOk, setSetsOk] = useState(false);
  const [aiUse, setAiUse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const total = items.reduce((s, i) => s + i.file.size, 0);
  const done = items.length > 0 && items.every((i) => i.state === "sent");

  async function choose(list: FileList | null) {
    setError(null);
    const files = [...(list ?? [])].filter(audio).sort((a, b) => a.name.localeCompare(b.name));
    if (!files.length) return setError("That folder has no WAV or MP3 files.");
    const size = files.reduce((s, f) => s + f.size, 0);
    if (size > MAX_BYTES) return setError(`That's ${fmtBytes(size)}. A folder can be up to 250 MB in total.`);
    setItems(await Promise.all(files.map(async (file) => ({ file, ...(await readTags(file)), state: "waiting" as const, progress: 0 }))));
  }

  const update = (i: number, patch: Partial<Item>) => setItems((all) => all.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function sendAll() {
    if (!genre) return setError("Choose a genre for the folder.");
    if (!aiUse) return setError("Say whether you used AI to make these tracks.");
    setError(null);
    setRunning(true);
    const batch = batchId();
    for (const [i, it] of items.entries()) {
      if (it.state === "sent") continue;
      update(i, { state: "sending", progress: 0, error: undefined });
      const analysis = await analyzeAudio(it.file);
      const r = await uploadTrack(
        handle,
        it.file,
        analysis,
        { title: it.title || it.file.name, artist: it.artist, message, genre, release_status: "", mix_status: "", ai_use: aiUse, asAccount: true, batch, sets_ok: setsOk },
        (p) => update(i, { progress: p }),
      );
      update(i, "error" in r ? { state: "failed", error: r.error } : { state: "sent", progress: 1 });
    }
    setRunning(false);
  }

  if (done)
    return (
      <div role="status" className="card p-6">
        <p className="font-medium">
          {items.length} tracks sent to {receiverName}.
        </p>
        <p className="mt-2 text-sm text-mute">They arrive as one folder. Each track gets its own receipt and updates.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input ref={folderRef} type="file" className="hidden" onChange={(e) => choose(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
        <input ref={filesRef} type="file" multiple accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden" onChange={(e) => choose(e.target.files)} />
        <button type="button" disabled={running} onClick={() => folderRef.current?.click()} className="btn-ghost btn-sm">
          Choose a folder
        </button>
        <button type="button" disabled={running} onClick={() => filesRef.current?.click()} className="btn-ghost btn-sm">
          Choose several files
        </button>
      </div>

      {items.length > 0 && (
        <>
          <p className="text-sm text-mute tnum">
            {items.length} tracks · {fmtBytes(total)} of 250 MB
          </p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {items.map((it, i) => (
              <li key={it.file.name + i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <input
                    aria-label={`Title for ${it.file.name}`}
                    value={it.title}
                    disabled={running || it.state === "sent"}
                    onChange={(e) => update(i, { title: e.target.value })}
                    className="w-full bg-transparent font-medium text-bone outline-none"
                  />
                  {it.error && <span className="block text-xs text-danger">{it.error}</span>}
                </span>
                <span className="shrink-0 text-xs text-mute tnum">
                  {it.state === "sent" ? "Sent" : it.state === "sending" ? `${Math.round(it.progress * 100)}%` : it.state === "failed" ? "Failed" : fmtBytes(it.file.size)}
                </span>
              </li>
            ))}
          </ul>
          <label className="block space-y-1.5">
            <span className="label">Genre for the folder</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={running} className="input">
              <option value="">Choose…</option>
              {genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="label">Message (optional, sent with every track)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={running} rows={3} maxLength={2000} className="input resize-y" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Did you use AI to make these tracks?</span>
            <select value={aiUse} onChange={(e) => setAiUse(e.target.value)} disabled={running} required className="input">
              <option value="" disabled>Choose one</option>
              <option value="none">No</option>
              <option value="partial">Partly (e.g. AI vocals, stems or mastering)</option>
              <option value="full">Fully AI-generated</option>
            </select>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={setsOk} onChange={(e) => setSetsOk(e.target.checked)} disabled={running} className="mt-0.5 size-4 shrink-0 accent-lime" />
            <span>
              Let {receiverName} play these in DJ sets, live and on broadcasts. <span className="text-mute">Leave this off and they&apos;re for listening and feedback only.</span>
            </span>
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <button type="button" onClick={sendAll} disabled={running} className="btn-lime">
          {running ? "Sending…" : items.some((i) => i.state === "failed") ? "Retry the failed tracks" : `Send ${items.length} tracks`}
        </button>
      )}
    </div>
  );
}
