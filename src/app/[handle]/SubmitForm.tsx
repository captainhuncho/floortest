"use client";

import { Turnstile } from "@/components/Turnstile";
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
  mobile: {
    card: "rounded-xl border border-line bg-ink-2",
    input: "input !rounded-md !border-line-2 !bg-ink-2 !text-[12px]",
    label: "text-[11px] font-bold uppercase text-dim",
    mute: "text-dim",
    line: "border-line",
    btn: "btn-lime !rounded-md font-extrabold",
    ghost: "btn-ghost !rounded-md",
    round: "rounded-md",
  },
};

export function SubmitForm({
  handle,
  receiverName,
  genres,
  look: lookName = "classic",
  account,
  allowSharing = false,
  sharingDownloads = false,
  botCheckKey = null,
}: {
  handle: string;
  receiverName: string;
  genres: string[];
  look?: keyof typeof LOOKS;
  /** Sending from a signed-in FloorTest account: name and email come from the account. */
  account?: { name: string; email: string };
  /** The collection lets the receiver share tracks with colleagues through a private listen-only link. */
  allowSharing?: boolean;
  /** The receiver is on a paid plan now, so colleagues can download this track (fixed at send time). */
  sharingDownloads?: boolean;
  /** Turnstile site key for anonymous senders when the bot check is on. */
  botCheckKey?: string | null;
}) {
  const L = LOOKS[lookName];
  const m = lookName === "mobile";
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

  if (phase === "done" && token && m) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-ink-2 p-5" role="status">
        <span className="w-fit rounded-md border border-lime/20 bg-lime/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-lime">
          Delivered
        </span>
        <h2 className="text-[22px] font-bold leading-7">&ldquo;{track.title}&rdquo; is on {receiverName}&apos;s desk.</h2>
        <p className="text-[12px] leading-[18px] text-mute">
          We sent a receipt to {account?.email ?? sender.email}. You&apos;ll hear from us when it&apos;s listened to, downloaded or replied to.
        </p>
        <hr className="border-line" />
        <div className="flex gap-2.5">
          <Link href={`/receipt/${token}`} className="flex flex-1 items-center justify-center rounded-[10px] bg-lime px-3.5 py-3 text-[12px] font-bold text-ink">
            View receipt
          </Link>
          <button
            onClick={reset}
            className="flex flex-1 items-center justify-center rounded-[10px] border border-line bg-ink px-3.5 py-3 text-[12px] font-bold"
          >
            Send another track
          </button>
        </div>
        {!account && (
          <a href="/sent" className="text-center text-[12px] font-medium text-mute underline underline-offset-4">
            Track everything you&apos;ve sent, no account needed
          </a>
        )}
      </div>
    );
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
          <Link href={`/receipt/${token}`} className={L.btn}>
            View receipt
          </Link>
          <button className={L.ghost} onClick={reset}>
            Send another track
          </button>
        </div>
        {!account && (
          <p className={`mt-4 text-sm ${L.mute}`}>
            <a href="/sent" className="underline underline-offset-4">
              Track everything you&apos;ve sent
            </a>
            , no account needed.
          </p>
        )}
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
  if (!file && m) {
    return (
      <div className="space-y-4">
        <div
          {...dropProps}
          className={`flex flex-col items-center gap-2 rounded-2xl border p-4 py-8 transition ${drag ? "border-lime bg-lime/5" : "border-line bg-ink-2"}`}
        >
          {fileInput}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-lime px-[18px] py-3 text-[14px] font-bold uppercase text-ink"
          >
            Choose WAV or MP3
          </button>
          <p className="text-center text-[11px] font-medium text-dim">or drag it here · up to 250 MB</p>
        </div>
        {errorBox}
      </div>
    );
  }

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
    <form onSubmit={submit} data-picked className="space-y-5" {...dropProps}>
      {fileInput}
      <div className={`${L.card} ${m ? "p-4" : "p-5"}`}>
        <div className="flex items-baseline justify-between gap-4">
          <p className={`truncate ${m ? "text-[13px] font-bold" : "font-medium"}`}>{m && <span aria-hidden className="mr-2 text-lime">♫</span>}{file.name}</p>
          {!busy && (
            <button type="button" onClick={() => inputRef.current?.click()} className={`shrink-0 underline underline-offset-4 ${m ? "text-[11px] font-bold text-lime" : "text-sm text-bone"}`}>
              Change file
            </button>
          )}
        </div>
        <div className="mt-4">
          <Waveform peaks={analysis?.peaks ?? null} progress={busy ? progress : 0} height={48} dim={analyzing} />
        </div>
        <p className={`mt-3 flex flex-wrap gap-y-1 ${m ? `gap-x-2 border-t ${L.line} pt-3 text-[11px] font-bold [&>*:not(:first-child)]:before:mr-2 [&>*:not(:first-child)]:before:font-normal [&>*:not(:first-child)]:before:text-line-2 [&>*:not(:first-child)]:before:content-['|']` : "gap-x-4 text-sm"} ${L.mute} tnum`}>
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

      <div className={`grid gap-4 ${m ? "grid-cols-2 gap-3" : "sm:grid-cols-2"}`}>
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
          <p className={`${m ? "col-span-2 text-[11px]" : "sm:col-span-2 text-sm"} ${L.mute}`}>
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
          {!m && <span className={`block text-sm ${L.mute}`}>For your receipt and updates only.</span>}
        </label>
        {m && <p className={`col-span-2 -mt-1 text-[11px] ${L.mute}`}>For your receipt and updates only.</p>}
          </>
        )}
      </div>

      <GenrePicker genres={genres} value={genre} onChange={setGenre} inputClass={L.input} labelClass={L.label} />
      <input type="hidden" name="genre" value={genre} />

      <fieldset>
        <legend className={L.label}>Mix status</legend>
        <div className={`mt-2 flex gap-2 ${m ? "flex-col" : "flex-wrap"}`}>
          {Object.entries(MIX_STATUS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mix === k}
              onClick={() => setMix(mix === k ? "" : k)}
              className={
                m
                  ? `flex items-center gap-2.5 rounded-md border p-3 text-left text-[12px] transition ${
                      mix === k ? "border-lime bg-ink-3 font-bold text-lime" : "border-line bg-ink-2 font-medium text-white"
                    }`
                  : `${L.round} border px-3.5 py-2 text-sm transition ${mix === k ? "border-lime bg-lime/10 text-bone" : `${L.line} ${L.mute} hover:text-bone`}`
              }
            >
              {m ? (
                <span
                  aria-hidden
                  className={`grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px] ${mix === k ? "border-lime" : "border-line-2"}`}
                >
                  {mix === k && <span className="size-1.5 rounded-full bg-lime" />}
                </span>
              ) : (
                mix === k && "✓ "
              )}
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      <input type="hidden" name="mix_status" value={mix} />

      <details open={m} className={`group ${m ? "" : `${L.round} border ${L.line}`}`}>
        <summary className={`cursor-pointer list-none ${m ? "py-2 text-[12px] font-bold text-white" : `px-4 py-3 text-sm ${L.mute} hover:text-bone`}`}>
          <span className="group-open:hidden">+ Add a message or release status</span>
          <span className="hidden group-open:inline">− Message and release status</span>
        </summary>
        <div className={`space-y-4 ${m ? "pt-2" : `border-t ${L.line} p-4`}`}>
          <label className="block space-y-1.5">
            <span className={L.label}>Message for {receiverName}</span>
            <textarea className={`${L.input} min-h-24 resize-y`} name="message" maxLength={2000} placeholder="Travels privately with the track." />
          </label>
          <label className="block space-y-1.5">
            <span className={L.label}>Release status</span>
            <select name="release_status" className={L.input} defaultValue="">
              <option value="">Not specified</option>
              <option value="unsigned">Unreleased</option>
              <option value="signed">Signed, forthcoming</option>
              <option value="released">Already released</option>
            </select>
          </label>
        </div>
      </details>

      <fieldset className="space-y-2">
        <legend className={`${L.label} mb-2`}>Did you use AI to make this track?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
              ["none", "No"],
              ["partial", "Partly", "e.g. AI vocals, stems or mastering"],
              ["full", "Fully AI-generated"],
            ].map(([v, l, hint]) => (
            <label key={v} className="flex cursor-pointer items-start gap-2 rounded-md border border-line px-3 py-2.5 text-[13px] has-[:checked]:border-lime/70">
              <input type="radio" name="ai_use" value={v} required className="mt-0.5 accent-lime" />
              <span>
                {l}
                {hint && <span className={`block text-[11px] ${L.mute}`}>{hint}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {errorBox}

      <label className="flex items-start gap-2.5 text-[13px]">
        <input type="checkbox" name="sets_ok" className="mt-0.5 size-4 shrink-0 accent-lime" />
        <span>
          Let {receiverName} play it in DJ sets, live and on broadcasts. <span className={L.mute}>Leave this off and it&apos;s for listening and feedback only.</span>
        </span>
      </label>

      <p className={`text-xs ${L.mute}`}>
        By sending you confirm you own or control this track, your answer about AI is accurate, and you&apos;re 18 or over. {receiverName} may listen to it and download it to evaluate it
        {allowSharing ? `, and share it with colleagues who have FloorTest accounts, through a private link, for promotion (${sharingDownloads ? "they can listen and download" : "listen only"})` : ""}. They can play it in sets only if you tick the box above, and can&apos;t release it anywhere without a signed agreement with you.{" "}
        <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a> ·{" "}
        <a href="/privacy" target="_blank" className="underline underline-offset-4">Privacy</a>
      </p>

      {!account && <Turnstile siteKey={botCheckKey} />}
      <button className={`${L.btn} w-full py-3.5 ${m ? "text-[14px]" : "text-base"}`} disabled={busy || analyzing}>
        {busy ? `Uploading… ${Math.round(progress * 100)}%` : analyzing ? "Reading audio…" : `Send to ${receiverName}`}
      </button>
    </form>
  );
}
