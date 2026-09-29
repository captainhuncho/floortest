"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { fmtBytes, fmtTime } from "@/lib/format";
import { MIX_STATUS } from "@/lib/plans";
import { GenrePicker } from "./GenrePicker";
import { useTrackUpload } from "./useTrackUpload";

/** Class names per page style; the flow is identical. */
const LOOKS = {
  classic: { card: "card", input: "input", label: "label", mute: "text-mute", line: "border-line", btn: "btn-lime", ghost: "btn-ghost", round: "rounded-md" },
  stage: {
    card: "rounded-2xl border border-white/10 bg-black/25",
    input: "stage-input",
    label: "stage-label",
    mute: "text-[#bdb1a3]",
    line: "border-white/10",
    btn: "btn-lime rounded-xl",
    ghost: "btn-ghost rounded-xl",
    round: "rounded-xl",
  },
};

export function SubmitForm({
  handle,
  receiverName,
  genres,
  look: lookName = "classic",
  account,
}: {
  handle: string;
  receiverName: string;
  genres: string[];
  look?: keyof typeof LOOKS;
  /** Sending from a signed-in FloorTest account: name and email come from the account. */
  account?: { name: string; email: string };
}) {
  const L = LOOKS[lookName];
  const { file, analysis, analyzing, phase, progress, error, token, sender, setSender, pick: pickFile, send, reset: resetUpload } =
    useTrackUpload(handle, { asAccount: !!account });
  const [drag, setDrag] = useState(false);
  const [track, setTrack] = useState({ title: "", artist: "" });
  const [genre, setGenre] = useState("");
  const [mix, setMix] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // From the dashboard, refresh the page so the new track shows in your Sent list.
  useEffect(() => {
    if (account && phase === "done") router.refresh();
  }, [account, phase, router]);

  async function pick(f: File | undefined) {
    const tags = await pickFile(f);
    if (tags) setTrack({ title: tags.title, artist: tags.artist });
  }

  function reset() {
    resetUpload();
    setTrack({ title: "", artist: "" });
    setGenre("");
    setMix("");
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(new FormData(e.currentTarget));
  }

  if (phase === "done" && token) {
    return (
      <div className={`${L.card} p-6`} role="status">
        <span className="chip border-lime/50 text-lime">Delivered</span>
        <h2 className="mt-4 text-2xl font-bold">&ldquo;{track.title}&rdquo; is on {receiverName}&apos;s desk.</h2>
        <p className={`mt-2 ${L.mute}`}>
          We sent a receipt to {account?.email ?? sender.email}. You&apos;ll hear from us when it&apos;s listened to, downloaded or replied to.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/t/${token}`} className={L.btn}>
            View receipt
          </Link>
          <button className={L.ghost} onClick={reset}>
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
        <div {...dropProps} className={`${L.card} border-dashed p-8 text-center transition ${drag ? "border-lime bg-lime/5" : ""}`}>
          {fileInput}
          <button type="button" onClick={() => inputRef.current?.click()} className={`${L.btn} px-6 py-3.5 text-base`}>
            Choose WAV or MP3
          </button>
          <p className={`mt-3 text-sm ${L.mute}`}>or drag it here · up to 250 MB</p>
        </div>
        {errorBox}
      </div>
    );
  }

  // Step 2: confirm what we read from the file, then the essentials.
  return (
    <form onSubmit={submit} className="space-y-5" {...dropProps}>
      {fileInput}
      <div className={`${L.card} p-5`}>
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
        <p className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm ${L.mute} tnum`}>
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
          <span className={L.label}>Track title</span>
          <input
            className={L.input}
            name="title"
            required
            value={track.title}
            onChange={(e) => setTrack((t) => ({ ...t, title: e.target.value }))}
          />
        </label>
        <label className="block space-y-1.5">
          <span className={L.label}>Artist</span>
          <input
            className={L.input}
            name="artist"
            placeholder="Defaults to your name"
            value={track.artist}
            onChange={(e) => setTrack((t) => ({ ...t, artist: e.target.value }))}
          />
        </label>
        {account ? (
          <p className={`sm:col-span-2 text-sm ${L.mute}`}>
            Sending as <span className="text-bone">{account.name}</span> ({account.email}). Updates go to your FloorTest account.
            <input type="hidden" name="name" value={account.name} />
            <input type="hidden" name="email" value={account.email} />
          </p>
        ) : (
          <>
        <label className="block space-y-1.5">
          <span className={L.label}>Your name</span>
          <input
            className={L.input}
            name="name"
            required
            autoComplete="name"
            value={sender.name}
            onChange={(e) => setSender((s) => ({ ...s, name: e.target.value }))}
          />
        </label>
        <label className="block space-y-1.5">
          <span className={L.label}>Your email</span>
          <input
            className={L.input}
            name="email"
            type="email"
            required
            autoComplete="email"
            value={sender.email}
            onChange={(e) => setSender((s) => ({ ...s, email: e.target.value }))}
          />
          <span className={`block text-sm ${L.mute}`}>For your receipt and updates only.</span>
        </label>
          </>
        )}
      </div>

      <GenrePicker genres={genres} value={genre} onChange={setGenre} inputClass={L.input} labelClass={L.label} />
      <input type="hidden" name="genre" value={genre} />

      <fieldset>
        <legend className={L.label}>Demo status</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(MIX_STATUS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mix === k}
              onClick={() => setMix(mix === k ? "" : k)}
              className={`${L.round} border px-3.5 py-2 text-sm transition ${
                mix === k ? "border-lime bg-lime/10 text-bone" : `${L.line} ${L.mute} hover:text-bone`
              }`}
            >
              {mix === k && "✓ "}
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      <input type="hidden" name="mix_status" value={mix} />

      <details className={`group ${L.round} border ${L.line}`}>
        <summary className={`cursor-pointer list-none px-4 py-3 text-sm ${L.mute} hover:text-bone`}>
          <span className="group-open:hidden">+ Add a message or release status</span>
          <span className="hidden group-open:inline">− Message and release status</span>
        </summary>
        <div className={`space-y-4 border-t ${L.line} p-4`}>
          <label className="block space-y-1.5">
            <span className={L.label}>Message for {receiverName}</span>
            <textarea className={`${L.input} min-h-24 resize-y`} name="message" maxLength={2000} placeholder="Travels privately with the track." />
          </label>
          <label className="block space-y-1.5">
            <span className={L.label}>Release status</span>
            <select name="release_status" className={L.input} defaultValue="">
              <option value="">Not specified</option>
              <option value="unsigned">Unreleased demo</option>
              <option value="signed">Signed, forthcoming</option>
              <option value="released">Already released</option>
            </select>
          </label>
        </div>
      </details>

      {errorBox}

      <p className={`text-xs ${L.mute}`}>
        By sending you confirm you own or control this track and you&apos;re 18 or over. {receiverName} may listen to it, download it and play it
        in their sets, but can&apos;t release it anywhere without a signed agreement with you.{" "}
        <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a> ·{" "}
        <a href="/privacy" target="_blank" className="underline underline-offset-4">Privacy</a>
      </p>

      <button className={`${L.btn} w-full py-3.5 text-base`} disabled={busy || analyzing}>
        {busy ? `Uploading… ${Math.round(progress * 100)}%` : analyzing ? "Reading audio…" : `Send to ${receiverName}`}
      </button>
    </form>
  );
}
