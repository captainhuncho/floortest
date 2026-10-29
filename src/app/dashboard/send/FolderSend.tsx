"use client";

import { Req } from "@/components/Req";
import { useRef, useState } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { fmtBytes } from "@/lib/format";
import { MAX_RELEASE_TRACKS } from "@/lib/plans";
import { readTags, type Tags } from "@/lib/tags";
import { Turnstile } from "@/components/Turnstile";
import { CANCELLED, MAX_BYTES, sendArtwork, uploadTrack } from "../../[handle]/useTrackUpload";
import { TransferScreen } from "../../[handle]/TransferScreen";
import { EmailCode, startEmailCheck } from "../../[handle]/EmailCode";
import { SetsPermission } from "../../[handle]/SetsPermission";
import { GenrePicker } from "../../[handle]/GenrePicker";
import { AI_CHOICES, AI_HELP, Choice, MIX_CHOICES, RELEASE_CHOICES } from "../../[handle]/Choice";

type Item = {
  file: File; tags: Tags; state: "waiting" | "sending" | "sent" | "failed"; progress: number; error?: string; genre?: string;
  /** Received and stored, waiting for the next virus-check batch: the track and its receipt email follow. */
  held?: boolean;
};
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
  trackArt = false,
  callout = null,
  presetGenre = "",
}: {
  /** The receiver's plan takes artwork: one optional cover for the whole release. */
  trackArt?: boolean;
  handle: string;
  receiverName: string;
  genres: string[];
  /** The receiver's folder limit (their plan). */
  folderBytes: number;
  /** Sending from a signed-in FloorTest account; otherwise the sender gives their name and email. */
  account?: { name: string; email: string };
  botCheckKey?: string | null;
  /** The collection (callout) receiving right now, shown on the transfer screen. */
  callout?: string | null;
  /** A genre the sender tapped in the receiver's brief; it starts as the folder's genre. */
  presetGenre?: string;
}) {
  const abort = useRef<AbortController | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [who, setWho] = useState({ name: "", email: "", instagram: "", streaming: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const [waiting, setWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [release, setRelease] = useState<{ title: string; artist: string; kind: Kind }>({ title: "", artist: "", kind: "ep" });
  // A folder's genre: one for every track, or each track its own. The sender says which; the sender's own pick wins over a
  // genre tapped in the brief.
  const [chosenGenre, setGenre] = useState<string | null>(null);
  const genre = chosenGenre ?? presetGenre;
  const [genreMode, setGenreMode] = useState<"same" | "each">("same");
  const [message, setMessage] = useState("");
  const [artwork, setArtwork] = useState<File | null>(null);
  const artSent = useRef(false);
  const [setsOk, setSetsOk] = useState(false);
  const [aiUse, setAiUse] = useState("");
  const [mix, setMix] = useState("");
  const [releaseStatus, setReleaseStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // The current file has landed and its virus check is running (up to a minute while the scanner wakes).
  const [scanning, setScanning] = useState(false);
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
    if (!release.artist.trim()) return setError("Add the artist.");
    if (!account && !who.instagram.trim() && !who.streaming.trim()) return setError("Add your Instagram or a streaming profile.");
    if (genreMode === "same" && !genre) return setError("Choose a genre for the folder, or say each track has its own.");
    if (genreMode === "each") {
      const missing = items.filter((it) => it.state !== "sent" && !it.genre?.trim());
      if (missing.length)
        return setError(
          `Choose a genre for ${missing.length === 1 ? `“${missing[0].tags.title || missing[0].file.name}”` : `${missing.length} tracks: ${missing.map((it) => `“${it.tags.title || it.file.name}”`).join(", ")}`}.`,
        );
    }
    if (!mix) return setError("Choose a mix status.");
    if (!releaseStatus) return setError("Choose a release status.");
    if (!aiUse) return setError("Say whether you used AI to make these tracks.");
    if (!account && (!who.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email))) return setError("Add your name and email.");
    setError(null);
    if (!account) {
      setChecking(true);
      const turnstile = String((formRef.current?.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? "");
      const r = await startEmailCheck(who.email, turnstile);
      setChecking(false);
      if (r === "code") return setWaiting(true);
      if (r) return setError(r);
    }
    upload();
  }

  async function upload() {
    setRunning(true);
    setStartedAt(Date.now());
    abort.current = new AbortController();
    let sentCount = items.filter((x) => x.state === "sent").length;
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
          genre: genreMode === "each" ? it.genre!.trim() : genre,
          release_status: releaseStatus,
          mix_status: mix,
          ai_use: aiUse,
          asAccount: !!account,
          ...(account ? {} : { name: who.name.trim(), email: who.email.trim(), sender_instagram: who.instagram, sender_streaming: who.streaming }),
          sets_ok: setsOk,
          release: { id, title: release.title.trim(), artist: release.artist.trim(), kind: release.kind },
          // The folder's tracks share one receipt email, sent once the last one is saved.
          send_size: items.length,
          track_no: it.tags.trackNo ?? i + 1,
          musical_key: it.tags.key,
          isrc: it.tags.isrc,
        },
        (p) => update(i, { progress: p }),
        abort.current.signal,
        undefined,
        { onChecking: setScanning },
      );
      if ("error" in r && r.error === CANCELLED) {
        update(i, { state: "waiting", progress: 0 });
        setError(sentCount > 0 ? "Transfer cancelled. Tracks already sent are on the desk; send again to finish the rest." : "Transfer cancelled. Nothing was sent.");
        break;
      }
      update(i, "error" in r ? { state: "failed", error: r.error } : { state: "sent", progress: 1, held: "held" in r });
      if (!("error" in r)) {
        sentCount++;
        // The release's cover rides on its first track that arrives; the desk shows it for the whole folder. A held
        // track has no token yet, so the cover waits for the next one that arrives.
        if ("token" in r && artwork && !artSent.current) {
          artSent.current = true;
          await sendArtwork(r.token, artwork);
        }
      }
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
        {items.some((i) => i.held) && (
          <p className="mt-2 text-sm text-mute">
            {items.every((i) => i.held) ? "They're" : "Some are"} still being checked for viruses, which can take up to 10 minutes. Each one reaches the desk as
            soon as it passes, and its receipt follows by email.
          </p>
        )}
      </div>
    );

  return (
    <>
    {running && (
      <TransferScreen
        receiverName={receiverName}
        handle={handle}
        callout={callout}
        startedAt={startedAt}
        onCancel={() => abort.current?.abort()}
        checking={scanning}
        files={items.map((it) => ({ name: it.file.name, size: it.file.size, progress: it.progress, state: it.state }))}
      />
    )}
    {waiting && (
      <EmailCode
        email={who.email.trim().toLowerCase()}
        receiverName={receiverName}
        sending={[`${release.title} · ${items.length} tracks`]}
        onConfirmed={() => {
          setWaiting(false);
          upload();
        }}
        onCancel={() => setWaiting(false)}
      />
    )}
    <form
      ref={formRef}
      hidden={waiting || running}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        sendAll();
      }}
    >
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
            <button type="button" onClick={() => filesRef.current?.click()} className="inline-flex min-h-11 items-center underline underline-offset-4">
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
              <span className="label">Folder name<Req /></span>
              <input value={release.title} disabled={running} required onChange={(e) => setRelease((r) => ({ ...r, title: e.target.value }))} maxLength={200} className="input" />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Artist<Req /></span>
              <input value={release.artist} disabled={running} required onChange={(e) => setRelease((r) => ({ ...r, artist: e.target.value }))} maxLength={200} className="input" />
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
                    className="tap-tall w-full bg-transparent font-medium text-bone outline-none"
                  />
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-mute">
                    <span className="truncate">{it.tags.artist || it.file.name}</span>
                    {[it.tags.bpm && `${it.tags.bpm} BPM`, it.tags.key, it.tags.isrc].filter(Boolean).map((c) => (
                      <span key={String(c)} className="rounded border border-line px-1.5 py-px tnum">
                        {c}
                      </span>
                    ))}
                  </span>
                  {genreMode === "each" && (
                    <span className="mt-2 block max-w-xs">
                      <GenrePicker
                        id={`folder-genre-${i}`}
                        genres={genres}
                        value={it.genre ?? ""}
                        onChange={(g) => update(i, { genre: g })}
                        inputClass="input py-1.5"
                        labelClass="sr-only"
                        dropdown
                        name={`Genre for ${it.tags.title || it.file.name}`}
                      />
                    </span>
                  )}
                  {it.error && <span className="block text-xs text-danger">{it.error}</span>}
                </span>
                {!running && it.state !== "sent" && (
                  <button type="button" aria-label={`Remove ${it.tags.title || it.file.name}`} onClick={() => setItems((all) => all.filter((_, j) => j !== i))} className="grid min-h-11 min-w-11 shrink-0 place-items-center text-mute hover:text-bone">
                    ×
                  </button>
                )}
                <span className="shrink-0 text-xs text-mute tnum">
                  {it.state === "sent" ? "Sent" : it.state === "sending" ? `${Math.round(it.progress * 100)}%` : it.state === "failed" ? "Failed" : fmtBytes(it.file.size)}
                </span>
              </li>
            ))}
          </ol>
          {!account && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="label">Your name<Req /></span>
                <input value={who.name} onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))} disabled={running} autoComplete="name" maxLength={100} required className="input" />
              </label>
              <label className="block space-y-1.5">
                <span className="label">Your email<Req /></span>
                <input type="email" value={who.email} onChange={(e) => setWho((w) => ({ ...w, email: e.target.value }))} disabled={running} autoComplete="email" maxLength={200} required className="input" />
              </label>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="label mb-1.5">
                  Your profiles<Req /> <span className="normal-case tracking-normal text-mute">(at least one)</span>
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="block text-xs text-mute">Instagram</span>
                    <input value={who.instagram} onChange={(e) => setWho((w) => ({ ...w, instagram: e.target.value }))} disabled={running} maxLength={300} placeholder="@yourname" className="input" />
                  </label>
                  <label className="block space-y-1">
                    <span className="block text-xs text-mute">Streaming profile</span>
                    <input value={who.streaming} onChange={(e) => setWho((w) => ({ ...w, streaming: e.target.value }))} disabled={running} inputMode="url" maxLength={300} placeholder="open.spotify.com/artist/…" className="input" />
                  </label>
                </div>
                <span className="block text-xs text-mute">Spotify, Apple Music, SoundCloud, Beatport, Bandcamp, YouTube or TikTok. Helps {receiverName} know who you are.</span>
              </fieldset>
            </div>
          )}
          <fieldset className="space-y-2.5" disabled={running}>
            <legend className="label mb-1.5">
              Genre<Req />
            </legend>
            <div role="group" aria-label="How the genre applies" className="inline-flex rounded-full border border-line bg-ink-2 p-1 text-sm">
              {(
                [
                  ["same", "One genre for all tracks"],
                  ["each", "Each track has its own"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={genreMode === m}
                  onClick={() => {
                    // Switching to per-track starts each track on the folder's genre, so only the different ones need changing.
                    if (m === "each" && genre) setItems((all) => all.map((it) => (it.genre ? it : { ...it, genre })));
                    setGenreMode(m);
                  }}
                  className={`tap-tall rounded-full px-3.5 py-1.5 transition ${genreMode === m ? "bg-bone font-semibold text-ink" : "text-mute hover:text-bone"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {genreMode === "same" ? (
              <GenrePicker id="folder-genre" genres={genres} value={genre} onChange={setGenre} inputClass="input" labelClass="sr-only" />
            ) : (
              <p className="text-xs text-mute">Choose a genre on each track above.</p>
            )}
          </fieldset>
          <Choice id="folder-mix" name="folder_mix" label="Mix status" value={mix} onChange={setMix} options={MIX_CHOICES} disabled={running} />
          <Choice id="folder-release" name="folder_release" label="Release status" value={releaseStatus} onChange={setReleaseStatus} options={RELEASE_CHOICES} disabled={running} />
          <Choice id="folder-ai" name="folder_ai" label="Made with AI?" value={aiUse} onChange={setAiUse} options={AI_CHOICES} help={AI_HELP} disabled={running} />
          <label className="block space-y-1.5">
            <span className="label">Message (optional, sent with the release)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} disabled={running} rows={3} maxLength={2000} className="input resize-y" />
          </label>
          {trackArt && (
            <label className="block space-y-1.5">
              <span className="label">Artwork (optional)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={running} onChange={(e) => setArtwork(e.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded file:border-0 file:bg-ink-3 file:px-3 file:py-1 file:text-bone" />
              <span className="block text-xs text-mute">One cover for the whole release. JPG, PNG or WebP, up to 25 MB. Sent at full quality.</span>
            </label>
          )}
          <SetsPermission receiverName={receiverName} many checked={setsOk} onChange={setSetsOk} disabled={running} />
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {items.length > 0 && !account && <Turnstile action="send" siteKey={botCheckKey} />}
      {items.length > 0 && (
        <p className="text-xs text-mute">
          <span className="text-danger">*</span> Required. By sending you confirm you own or control these tracks, your answer about AI is accurate, and you&apos;re 18 or over.{" "}
          <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a>
        </p>
      )}
      {items.length > 0 && (
        <button type="submit" disabled={running || checking} className="btn-lime min-h-11 w-full">
          {checking ? "Checking your email…" : running ? "Sending…" : items.some((i) => i.state === "failed") ? "Retry the failed tracks" : `Send folder (${items.length} tracks)`}
        </button>
      )}
    </form>
    </>
  );
}
