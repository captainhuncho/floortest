"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { fmtBytes, fmtTime } from "@/lib/format";
import { MIX_STATUS, RELEASE_STATUS } from "@/lib/plans";
import { GenrePicker } from "./GenrePicker";
import { useTrackUpload } from "./useTrackUpload";

type Props = {
  handle: string;
  receiverName: string;
  collectionName: string | null;
  bpmRange: [number, number] | null;
  genres: string[];
  maxMb: number;
  retentionDays: number;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StageForm({ handle, receiverName, collectionName, bpmRange, genres, maxMb, retentionDays }: Props) {
  const up = useTrackUpload(handle);
  const [step, setStep] = useState<1 | 2>(1);
  const [drag, setDrag] = useState(false);
  const [f, setF] = useState({ title: "", artist: "", release: "unsigned", mix: "", message: "", genre: "" });
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const first = receiverName.split(/\s+/)[0];
  const busy = up.phase === "uploading";

  async function pick(file: File | undefined) {
    const tags = await up.pick(file);
    // Only fill fields the sender hasn't typed into.
    if (tags) setF((v) => ({ ...v, title: v.title || tags.title, artist: v.artist || tags.artist }));
  }

  const missing = [
    !up.sender.name.trim() && "your name",
    !up.file && "a WAV or MP3",
    !f.title.trim() && "a track title",
    !f.genre.trim() && "a genre",
    !EMAIL.test(up.sender.email) && "a valid email",
  ].filter(Boolean) as string[];

  function toReview(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missing.length) {
      up.setError(`Add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
      return;
    }
    up.setError(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function send() {
    const fd = new FormData();
    fd.set("name", up.sender.name);
    fd.set("email", up.sender.email);
    fd.set("title", f.title);
    fd.set("artist", f.artist || up.sender.name);
    fd.set("release_status", f.release);
    fd.set("mix_status", f.mix);
    fd.set("genre", f.genre);
    fd.set("message", f.message);
    up.send(fd);
  }

  const header = (label: string) => (
    <div className="flex items-center justify-between border-b border-white/10 pb-5">
      <p className="stage-label text-bone">{label}</p>
      <p className="stage-label" aria-live="polite">
        {up.phase === "done" ? "Delivered" : `Step 0${step} of 02`}
      </p>
    </div>
  );

  const destination = (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-white/10 py-5">
      <div className="min-w-0">
        <p className="stage-label">Sending to</p>
        <p className="mt-1 break-words text-xl font-semibold">{receiverName}</p>
      </div>
      {collectionName && <p className="stage-label text-lime">→ {collectionName}</p>}
    </div>
  );

  const errorBox = up.error && (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#ffb4aa]">
      {up.error}
    </p>
  );

  /* ── Delivered ── */
  if (up.phase === "done" && up.token) {
    return (
      <div>
        {header("Audio submission")}
        <div className="py-8" role="status">
          <span className="rounded-full bg-lime px-3 py-1 font-[family-name:var(--font-stage-mono)] text-xs font-medium uppercase text-ink">
            Delivered
          </span>
          <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight">
            &ldquo;{f.title}&rdquo; is with {first}.
          </h2>
          <p className="mt-3 text-[#d8cfc4]">
            Receipt sent to {up.sender.email}. We&apos;ll email you when it&apos;s listened to, when the original is downloaded, and
            if {first} replies. Confirm your email from that message so you show as a verified sender.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={`/t/${up.token}`} className="btn-lime">
              View private receipt
            </Link>
            <button
              className="btn border border-white/15 hover:bg-white/5"
              onClick={() => {
                up.reset();
                setF((v) => ({ ...v, title: "", artist: "", message: "", mix: "", genre: "" }));
                setStep(1);
              }}
            >
              Send another track
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Step 2: review ── */
  if (step === 2 && up.file) {
    const a = up.analysis;
    const outOfRange = bpmRange && a?.bpm && (a.bpm < bpmRange[0] - 2 || a.bpm > bpmRange[1] + 2);
    const rows: [string, string][] = [
      ["Track", `${f.artist || up.sender.name} – ${f.title}`],
      ["Type", RELEASE_STATUS[f.release as keyof typeof RELEASE_STATUS] ?? "Not specified"],
      ["Genre", f.genre],
      ["Demo status", MIX_STATUS[f.mix as keyof typeof MIX_STATUS] ?? "Not specified"],
      ["From", `${up.sender.name} · ${up.sender.email}`],
    ];
    return (
      <div>
        {header("Review & send")}
        {destination}
        <div className="py-5">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="truncate font-[family-name:var(--font-stage-mono)] text-sm">{up.file.name}</p>
            <div className="mt-3">
              <Waveform peaks={a?.peaks ?? null} progress={busy ? up.progress : 0} height={52} dim={!a} />
            </div>
            <p className="stage-label mt-3 flex flex-wrap gap-x-4 gap-y-1 normal-case tracking-normal">
              <span>{/\.wav$/i.test(up.file.name) ? "WAV" : "MP3"}</span>
              <span>{fmtBytes(up.file.size)}</span>
              {a && <span>{fmtTime(a.duration)}</span>}
              {a?.bpm && <span>~{Math.round(a.bpm)} BPM</span>}
            </p>
          </div>
          {outOfRange && (
            <p className="mt-3 rounded-xl border border-white/10 px-4 py-3 text-sm text-[#d8cfc4]">
              This reads around {Math.round(a!.bpm!)} BPM. {first}&apos;s brief asks for {bpmRange![0]}–{bpmRange![1]}. You can still
              send it.
            </p>
          )}
          <dl className="mt-5 divide-y divide-white/10">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 py-2.5">
                <dt className="stage-label pt-0.5">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
            {f.message && (
              <div className="grid grid-cols-[110px_1fr] gap-3 py-2.5">
                <dt className="stage-label pt-0.5">Message</dt>
                <dd className="whitespace-pre-wrap text-[#d8cfc4]">{f.message}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="space-y-3">
          {errorBox}
          <button onClick={send} disabled={busy} className="btn-lime w-full rounded-xl py-4 text-base">
            {busy ? `Uploading… ${Math.round(up.progress * 100)}%` : `Send to ${first}`}
          </button>
          <button onClick={() => setStep(1)} disabled={busy} className="btn w-full rounded-xl py-3 text-[#d8cfc4] hover:bg-white/5">
            ← Edit details
          </button>
          <p className="text-center text-sm text-[#bdb1a3]">
            Only {first} can hear it. Files that aren&apos;t kept are deleted within {retentionDays} days.
          </p>
        </div>
      </div>
    );
  }

  /* ── Step 1: details ── */
  const invalid = (bad: boolean) => (touched && bad ? "border-danger/60" : "");
  return (
    <form onSubmit={toReview} noValidate>
      {header("New audio submission")}
      {destination}

      <div className="space-y-5 pt-5">
        <label className="block space-y-2">
          <span className="stage-label">Your name / artist name</span>
          <input
            className={`stage-input ${invalid(!up.sender.name.trim())}`}
            name="name"
            autoComplete="name"
            placeholder="Your name / artist name"
            value={up.sender.name}
            onChange={(e) => up.setSender((s) => ({ ...s, name: e.target.value }))}
          />
        </label>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
          className="space-y-3"
        >
          <input
            ref={inputRef}
            id="stage-file"
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
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-between rounded-xl bg-bone px-4 py-3.5 text-ink transition hover:bg-white"
          >
            <span className="flex items-center gap-2 font-[family-name:var(--font-stage-mono)] text-[15px]">
              <span aria-hidden>↥</span> {up.file ? "Replace file" : "Upload WAV or MP3"}
            </span>
            <span className="hidden font-[family-name:var(--font-stage-mono)] text-xs uppercase text-ink/70 sm:inline">Audio files only</span>
          </button>

          {up.file ? (
            <div className={`rounded-2xl border border-white/10 bg-black/25 p-4 ${drag ? "border-lime" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-[family-name:var(--font-stage-mono)] text-sm">{up.file.name}</p>
                <p className="stage-label shrink-0">{fmtBytes(up.file.size)}</p>
              </div>
              <div className="mt-3">
                <Waveform peaks={up.analysis?.peaks ?? null} height={40} dim={up.analyzing} />
              </div>
              <p className="stage-label mt-2 normal-case tracking-normal">
                {up.analyzing
                  ? "Reading audio…"
                  : up.analysis
                    ? `${fmtTime(up.analysis.duration)}${up.analysis.bpm ? ` · ~${Math.round(up.analysis.bpm)} BPM` : ""} · title and artist filled from the file`
                    : "No preview in this browser. The upload still works."}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`flex w-full flex-col items-center rounded-2xl border border-dashed px-4 py-8 transition ${
                drag ? "border-lime bg-lime/5" : touched ? "border-danger/60" : "border-white/20 hover:border-white/40"
              }`}
            >
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-lime text-2xl leading-none text-ink">
                +
              </span>
              <span className="mt-3 font-semibold">Drop your track here</span>
              <span className="mt-1 text-sm text-[#bdb1a3]">WAV or MP3 · up to {maxMb} MB</span>
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="stage-label">
              Music type <span className="text-[#8f8377]">· demos first</span>
            </span>
            <select className="stage-input appearance-none" value={f.release} onChange={(e) => setF({ ...f, release: e.target.value })}>
              {Object.entries(RELEASE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <GenrePicker
            genres={genres}
            value={f.genre}
            onChange={(genre) => setF((v) => ({ ...v, genre }))}
            inputClass="stage-input appearance-none"
            labelClass="stage-label"
            invalid={touched && !f.genre.trim()}
          />
        </div>
        <div className="flex items-baseline gap-3 rounded-xl border border-white/10 px-4 py-3">
          <p className="stage-label shrink-0 text-lime">Original file required</p>
          <p className="text-sm leading-snug text-[#bdb1a3]">No streaming, cloud-storage or expiring links.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="stage-label">Track title</span>
            <input
              className={`stage-input ${invalid(!f.title.trim())}`}
              placeholder="Track title"
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </label>
          <label className="block space-y-2">
            <span className="stage-label">Artist</span>
            <input className="stage-input" placeholder="Artist name" value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="stage-label">Your email</span>
          <input
            className={`stage-input ${invalid(!EMAIL.test(up.sender.email))}`}
            type="email"
            autoComplete="email"
            placeholder="Listen and download alerts come here"
            value={up.sender.email}
            onChange={(e) => up.setSender((s) => ({ ...s, email: e.target.value }))}
          />
        </label>

        <label className="block space-y-2">
          <span className="stage-label flex justify-between">
            Private message <span>Optional</span>
          </span>
          <textarea
            className="stage-input min-h-24 resize-y"
            maxLength={2000}
            placeholder={`What should ${first} know?`}
            value={f.message}
            onChange={(e) => setF({ ...f, message: e.target.value })}
          />
        </label>

        <fieldset>
          <legend className="stage-label mb-2">Demo status</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(MIX_STATUS).map(([k, v]) => {
              const on = f.mix === k;
              return (
                <label
                  key={k}
                  className={`cursor-pointer rounded-xl border px-3.5 py-2.5 font-[family-name:var(--font-stage-mono)] text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime ${
                    on ? "border-lime bg-lime/10 text-lime" : "border-white/15 text-[#d8cfc4] hover:border-white/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="mix"
                    value={k}
                    checked={on}
                    onChange={() => setF({ ...f, mix: k })}
                    onClick={() => on && setF({ ...f, mix: "" })}
                    className="sr-only"
                  />
                  {on && <span aria-hidden>✓ </span>}
                  {v}
                </label>
              );
            })}
          </div>
        </fieldset>

        {errorBox}

        <button className="btn-lime w-full rounded-xl py-4 text-base" disabled={up.analyzing}>
          {up.analyzing ? "Reading audio…" : "Review & send →"}
        </button>

        <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime" />
          <div>
            <p className="font-semibold">No account needed.</p>
            <p className="text-sm text-[#bdb1a3]">We&apos;ll email you a link to confirm your address, plus your private receipt.</p>
          </div>
        </div>
      </div>
    </form>
  );
}
