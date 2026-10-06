"use client";

import { useRef, useState } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { fmtBytes } from "@/lib/format";
import { MAX_RELEASE_TRACKS } from "@/lib/plans";
import { readTags, type Tags } from "@/lib/tags";
import { Turnstile } from "@/components/Turnstile";
import { MAX_BYTES, uploadTrack } from "../../[handle]/useTrackUpload";

type Item = { file: File; tags: Tags; state: "waiting" | "sending" | "sent" | "failed"; progress: number; error?: string };
type Kind = "ep" | "album";

const audio = (f: File) => /\.(wav|mp3)$/i.test(f.name);
/** Files inside a dropped folder (or loose dropped files), read through the browser's entry API. */
async function droppedFiles(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const walk = async (e: FileSystemEntry): Promise<File[]> => {
    if (e.isFile) return [await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej))];
    const reader = (e as FileSystemDirectoryEntry).createReader();
    const all: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      all.push(...batch);
    }
    return (await Promise.all(all.map(walk))).flat();
  };
  return (await Promise.all(entries.map(walk))).flat();
}

const releaseId = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b % 64]).join("");

/**
 * Send folders (an EP, album or set of tracks), to receivers whose plan accepts folders (Pro and Team), up to their folder size. Pick a folder or several files; each file's own details (title, artist,
 * album, track number, BPM, key, ISRC) fill the list, in track order. They arrive as one release the receiver can open,
 * keep or pass whole, and download as its own folder in a crate. Every file still goes through the usual checks.
 */
export function FolderSend({
  handle,
  receiverName,
  genres,
  folderBytes,
  account,
  botCheckKey = null,
}: {
  handle: string;
  receiverName: string;
  genres: string[];
  /** The receiver's folder limit (their plan). */
  folderBytes: number;
  /** Sending from a signed-in FloorTest account; otherwise the sender gives their name and email. */
  account?: { name: string; email: string };
  botCheckKey?: string | null;
}) {
  const [who, setWho] = useState({ name: "", email: "", links: "" });
  const formRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [release, setRelease] = useState<{ title: string; artist: string; kind: Kind }>({ title: "", artist: "", kind: "ep" });
  const [genre, setGenre] = useState("");
  const [message, setMessage] = useState("");
  const [setsOk, setSetsOk] = useState(false);
  const [aiUse, setAiUse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [id] = useState(releaseId);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const total = items.reduce((s, i) => s + i.file.size, 0);
  const done = items.length > 0 && items.every((i) => i.state === "sent");

  const [drag, setDrag] = useState(false);

  async function choose(list: FileList | File[] | null) {
    setError(null);
    const files = [...(list ?? [])].filter(audio);
    if (!files.length) return setError("That folder has no WAV or MP3 files.");
    if (files.length > MAX_RELEASE_TRACKS) return setError(`A folder can have up to ${MAX_RELEASE_TRACKS} tracks.`);
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) return setError(`"${big.name}" is over 250 MB.`);
    const size = files.reduce((n, f) => n + f.size, 0);
    if (size > folderBytes) return setError(`That's ${fmtBytes(size)}. ${receiverName} can receive up to ${fmtBytes(folderBytes)} in one folder.`);
    const read = await Promise.all(files.map(async (file) => ({ file, tags: await readTags(file), state: "waiting" as const, progress: 0 })));
    // Track order from the files' own numbers, then by name.
    read.sort((a, b) => (a.tags.trackNo ?? 99) - (b.tags.trackNo ?? 99) || a.file.name.localeCompare(b.file.name));
    const albums = new Set(read.map((r) => r.tags.album).filter(Boolean));
    const artists = new Set(read.map((r) => r.tags.artist).filter(Boolean));
    setRelease({
      title: albums.size === 1 ? [...albums][0] : "",
      artist: artists.size === 1 ? [...artists][0] : "",
      kind: read.length >= 7 ? "album" : "ep",
    });
    setItems(read);
  }

  const update = (i: number, patch: Partial<Item>) => setItems((all) => all.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const editTags = (i: number, t: Partial<Tags>) => setItems((all) => all.map((it, j) => (j === i ? { ...it, tags: { ...it.tags, ...t } } : it)));

  async function sendAll() {
    if (!release.title.trim()) return setError("Give the folder a name.");
    if (!genre) return setError("Choose a genre.");
    if (!aiUse) return setError("Say whether you used AI to make these tracks.");
    if (!account && (!who.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email))) return setError("Add your name and email.");
    const turnstile = String((formRef.current?.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? "");
    setError(null);
    setRunning(true);
    for (const [i, it] of items.entries()) {
      if (it.state === "sent") continue;
      update(i, { state: "sending", progress: 0, error: undefined });
      const analysis = await analyzeAudio(it.file);
      const r = await uploadTrack(
        handle,
        it.file,
        analysis,
        {
          title: it.tags.title || it.file.name,
          artist: it.tags.artist || release.artist,
          message,
          genre,
          release_status: "",
          mix_status: "",
          ai_use: aiUse,
          asAccount: !!account,
          ...(account ? {} : { name: who.name.trim(), email: who.email.trim(), sender_links: who.links, turnstile }),
          sets_ok: setsOk,
          release: { id, title: release.title.trim(), artist: release.artist.trim(), kind: release.kind },
          track_no: it.tags.trackNo ?? i + 1,
          musical_key: it.tags.key,
          isrc: it.tags.isrc,
        },
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
          &ldquo;{release.title}&rdquo; ({items.length} tracks) sent to {receiverName}.
        </p>
        <p className="mt-2 text-sm text-mute">It arrives as one folder. Each track gets its own receipt and updates.</p>
      </div>
    );

  return (
    <div ref={formRef} className="space-y-4">
      <input ref={folderRef} type="file" className="hidden" onChange={(e) => choose(e.target.files)} {...{ webkitdirectory: "", directory: "" }} />
      <input ref={filesRef} type="file" multiple accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden" onChange={(e) => choose(e.target.files)} />
      {!items.length && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDrag(false);
            choose(await droppedFiles(e.dataTransfer));
          }}
          className={`card border-dashed p-8 text-center transition ${drag ? "border-lime bg-lime/5" : ""}`}
        >
          <button type="button" disabled={running} onClick={() => folderRef.current?.click()} className="btn-lime">
            Choose a folder
          </button>
          <p className="mt-3 text-sm text-mute">
            or drag it here ·{" "}
            <button type="button" onClick={() => filesRef.current?.click()} className="underline underline-offset-4">
              pick files
            </button>
          </p>
          <p className="mt-1 text-xs text-mute">Up to {MAX_RELEASE_TRACKS} tracks and {fmtBytes(folderBytes)}. Titles, track order, BPM and key are read from your files.</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <label className="block space-y-1.5">
              <span className="label">Folder name</span>
              <input value={release.title} disabled={running} onChange={(e) => setRelease((r) => ({ ...r, title: e.target.value }))} maxLength={200} className="input" />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Artist</span>
              <input value={release.artist} disabled={running} placeholder="Defaults to your name" onChange={(e) => setRelease((r) => ({ ...r, artist: e.target.value }))} maxLength={200} className="input" />
            </label>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm text-mute tnum">
              <span>{items.length} of {MAX_RELEASE_TRACKS} tracks</span>
              <span>
                {fmtBytes(total)} of {fmtBytes(folderBytes)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-3" role="progressbar" aria-label="Folder size" aria-valuenow={Math.round((total / folderBytes) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${total > folderBytes ? "bg-danger" : "bg-lime"}`} style={{ width: `${Math.min(100, (total / folderBytes) * 100)}%` }} />
            </div>
          </div>
          <ol className="divide-y divide-line rounded-md border border-line">
            {items.map((it, i) => (
              <li key={it.file.name + i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-5 shrink-0 text-right text-mute tnum">{it.tags.trackNo ?? i + 1}</span>
                <span className="min-w-0 flex-1">
                  <input
                    aria-label={`Title for ${it.file.name}`}
                    value={it.tags.title}
                    disabled={running || it.state === "sent"}
                    onChange={(e) => editTags(i, { title: e.target.value })}
                    className="w-full bg-transparent font-medium text-bone outline-none"
                  />
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-mute">
                    <span className="truncate">{it.tags.artist || it.file.name}</span>
                    {[it.tags.bpm && `${it.tags.bpm} BPM`, it.tags.key, it.tags.isrc].filter(Boolean).map((c) => (
                      <span key={String(c)} className="rounded border border-line px-1.5 py-px tnum">
                        {c}
                      </span>
                    ))}
                  </span>
                  {it.error && <span className="block text-xs text-danger">{it.error}</span>}
                </span>
                {!running && it.state !== "sent" && (
                  <button type="button" aria-label={`Remove ${it.tags.title || it.file.name}`} onClick={() => setItems((all) => all.filter((_, j) => j !== i))} className="shrink-0 px-1 text-mute hover:text-bone">
                    ×
                  </button>
                )}
                <span className="shrink-0 text-xs text-mute tnum">
                  {it.state === "sent" ? "Sent" : it.state === "sending" ? `${Math.round(it.progress * 100)}%` : it.state === "failed" ? "Failed" : fmtBytes(it.file.size)}
                </span>
              </li>
            ))}
          </ol>
          <label className="block space-y-1.5">
            <span className="label">Genre</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={running} className="input">
              <option value="">Choose…</option>
              {genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="label">Message (optional, sent with the release)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={running} rows={3} maxLength={2000} className="input resize-y" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Did you use AI to make these tracks?</span>
            <select value={aiUse} onChange={(e) => setAiUse(e.target.value)} disabled={running} required className="input">
              <option value="" disabled>
                Choose one
              </option>
              <option value="none">No</option>
              <option value="partial">Partly (e.g. AI vocals, stems or mastering)</option>
              <option value="full">Fully AI-generated</option>
            </select>
          </label>
          {!account && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="label">Your name</span>
                <input value={who.name} onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))} disabled={running} autoComplete="name" maxLength={100} className="input" />
              </label>
              <label className="block space-y-1.5">
                <span className="label">Your email</span>
                <input type="email" value={who.email} onChange={(e) => setWho((w) => ({ ...w, email: e.target.value }))} disabled={running} autoComplete="email" maxLength={200} className="input" />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="label">Your Instagram or streaming profile (optional)</span>
                <input value={who.links} onChange={(e) => setWho((w) => ({ ...w, links: e.target.value }))} disabled={running} maxLength={600} placeholder="instagram.com/you, open.spotify.com/artist/…" className="input" />
              </label>
            </div>
          )}
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
      {items.length > 0 && !account && <Turnstile siteKey={botCheckKey} />}
      {items.length > 0 && (
        <p className="text-xs text-mute">
          By sending you confirm you own or control these tracks, your answer about AI is accurate, and you&apos;re 18 or over.{" "}
          <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a>
        </p>
      )}
      {items.length > 0 && (
        <button type="button" onClick={sendAll} disabled={running} className="btn-lime">
          {running ? "Sending…" : items.some((i) => i.state === "failed") ? "Retry the failed tracks" : `Send folder (${items.length} tracks)`}
        </button>
      )}
    </div>
  );
}
