"use client";

import { Req } from "@/components/Req";
import { Turnstile } from "@/components/Turnstile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { fmtBytes, fmtTime } from "@/lib/format";
import { MIX_STATUS } from "@/lib/plans";
import { EmailCode, startEmailCheck } from "./EmailCode";
import { GenrePicker } from "./GenrePicker";
import { MAX_FILES, useTrackUpload, type Item } from "./useTrackUpload";

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
  const { items, phase, error, setError, sender, setSender, add, remove, edit, send, reset: resetUpload } = useTrackUpload(handle, { asAccount: !!account });
  const [drag, setDrag] = useState(false);
  const [genre, setGenre] = useState("");
  const [mix, setMix] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Without an account: the form waiting while the sender types the emailed code.
  const [waiting, setWaiting] = useState<{ email: string; fd: FormData } | null>(null);
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  const many = items.length > 1;
  const busy = phase === "uploading";
  const analyzing = items.some((it) => it.analyzing);
  const ordered = items;

  // From the dashboard, refresh the page so the new tracks show in your Sent list.
  useEffect(() => {
    if (account && phase === "done") router.refresh();
  }, [account, phase, router]);

  function reset() {
    resetUpload();
    setGenre("");
    setMix("");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (account && (!genre || !mix)) return setError(!genre ? "Choose a genre." : "Choose a mix status.");
    if (account) return send(fd);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    if (!email) return send(fd); // the usual "add your email" message
    if (!genre) return setError("Choose a genre.");
    if (!mix) return setError("Choose a mix status.");
    setChecking(true);
    const r = await startEmailCheck(email, String(fd.get("cf-turnstile-response") ?? ""));
    setChecking(false);
    if (r === null) return send(fd);
    if (r === "code") return setWaiting({ email, fd });
    setError(r);
  }

  const sentTitle = many ? `${items.length} tracks` : `“${items[0]?.tags.title}”`;
  const firstToken = ordered.find((it) => it.token)?.token;

  if (phase === "done" && firstToken) {
    return (
      <div className={m ? "flex flex-col gap-4 rounded-2xl border border-line bg-ink-2 p-5" : `${L.card} p-6`} role="status">
        <span className={m ? "w-fit rounded-md border border-lime/20 bg-lime/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-lime" : "chip w-fit border-lime/50 text-lime"}>Delivered</span>
        <h2 className={m ? "text-[22px] font-bold leading-7" : "mt-4 text-2xl font-bold"}>{sentTitle} {many ? "are" : "is"} on {receiverName}&apos;s desk.</h2>
        <p className={m ? "text-[12px] leading-[18px] text-mute" : `mt-2 ${L.mute}`}>
          We sent {many ? "receipts" : "a receipt"} to {account?.email ?? sender.email}. You&apos;ll hear from us when {many ? "they're" : "it's"} listened to, downloaded or replied to.
        </p>
        <div className={m ? "flex gap-2.5" : "mt-6 flex flex-wrap gap-3"}>
          <Link href={many ? "/sent" : `/receipt/${firstToken}`} className={m ? "flex flex-1 items-center justify-center rounded-[10px] bg-lime px-3.5 py-3 text-[12px] font-bold text-ink" : L.btn}>
            {many ? "See your receipts" : "View receipt"}
          </Link>
          <button onClick={reset} className={m ? "flex flex-1 items-center justify-center rounded-[10px] border border-line bg-ink px-3.5 py-3 text-[12px] font-bold" : L.ghost}>
            Send more
          </button>
        </div>
      </div>
    );
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (!busy) add(e.dataTransfer.files);
    },
  };
  const fileInput = (
    <input
      ref={inputRef}
      id="track-file"
      type="file"
      multiple
      aria-label="Choose WAV or MP3 files"
      tabIndex={-1}
      accept=".wav,.mp3,audio/wav,audio/mpeg"
      className="sr-only"
      onChange={(e) => {
        add(e.target.files);
        e.target.value = "";
      }}
    />
  );
  const errorBox = error && (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );

  // Step 1: the only thing asked for is the files.
  if (!items.length) {
    return (
      <div className="space-y-4">
        <div {...dropProps} className={m ? `flex flex-col items-center gap-2 rounded-2xl border p-4 py-8 transition ${drag ? "border-lime bg-lime/5" : "border-line bg-ink-2"}` : `${L.card} border-dashed p-8 text-center transition ${drag ? "border-lime bg-lime/5" : ""}`}>
          {fileInput}
          <button type="button" onClick={() => inputRef.current?.click()} className={m ? "rounded-full bg-lime px-[18px] py-3 text-[14px] font-bold uppercase text-ink" : `${L.btn} px-6 py-3.5 text-base`}>
            Choose WAV or MP3
          </button>
          <p className={m ? "text-center text-[11px] font-medium text-dim" : `mt-3 text-sm ${L.mute}`}>or drag them here · up to {MAX_FILES} tracks · 250 MB in total</p>
        </div>
        {errorBox}
      </div>
    );
  }

  const row = (it: Item, i: number) => (
    <li key={it.id} className={`${L.card} ${m ? "p-3" : "p-4"} space-y-2`}>
      <div className="flex items-center gap-3">
        {many && <span className={`w-5 shrink-0 text-right text-[12px] tnum ${L.mute}`}>{i + 1}</span>}
        <p className={`min-w-0 flex-1 truncate text-[12px] ${L.mute}`}>
          {it.file.name} · {/\.wav$/i.test(it.file.name) ? "WAV" : "MP3"} · {fmtBytes(it.file.size)}
          {it.analysis && ` · ${fmtTime(it.analysis.duration)}`}
          {(it.tags.bpm ?? it.analysis?.bpm) && ` · ${Math.round((it.tags.bpm ?? it.analysis?.bpm)!)} BPM`}
          {it.tags.key && ` · ${it.tags.key}`}
        </p>
        {it.status === "done" ? (
          <span className="text-[12px] text-lime">✓ Sent</span>
        ) : it.status === "uploading" ? (
          <span className="text-[12px] tnum">{Math.round(it.progress * 100)}%</span>
        ) : (
          !busy && (
            <button type="button" onClick={() => remove(it.id)} className={`text-[12px] underline underline-offset-4 ${L.mute} hover:text-bone`} aria-label={`Remove ${it.file.name}`}>
              Remove
            </button>
          )
        )}
      </div>
      {!many && <Waveform peaks={it.analysis?.peaks ?? null} progress={it.status === "uploading" ? it.progress : 0} height={48} dim={it.analyzing} />}
      <div className={`grid gap-2 ${many ? "grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]" : m ? "grid-cols-2 gap-3" : "sm:grid-cols-2 gap-4"}`}>
        <label className="block space-y-1">
          <span className={L.label}>Track title<Req /></span>
          <input className={L.input} required value={it.tags.title} disabled={it.status === "done"} onChange={(e) => edit(it.id, { title: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className={L.label}>Artist</span>
          <input className={L.input} placeholder="Defaults to your name" value={it.tags.artist} disabled={it.status === "done"} onChange={(e) => edit(it.id, { artist: e.target.value })} />
        </label>
      </div>
      {it.error && <p className="text-[12px] text-danger">{it.error}</p>}
    </li>
  );

  // Step 2: confirm what we read from the files, then the essentials.
  return (
    <form onSubmit={submit} data-picked className="space-y-5" {...dropProps}>
      {fileInput}
      <ol className="space-y-3">{ordered.map(row)}</ol>
      {!busy && items.length < MAX_FILES && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed ${L.line} px-4 py-3 text-sm font-semibold text-bone hover:border-lime/60`}
        >
          + Add another track
          <span className={`font-normal ${L.mute}`}>
            ({MAX_FILES - items.length} more, {MAX_FILES} max)
          </span>
        </button>
      )}

      <div className={`grid gap-4 ${m ? "grid-cols-2 gap-3" : "sm:grid-cols-2"}`}>
        {account ? (
          <p className={`${m ? "col-span-2 text-[11px]" : "sm:col-span-2 text-sm"} ${L.mute}`}>
            Sending as <span className="text-bone">{account.name}</span> ({account.email}). Updates go to your FloorTest account.
            <input type="hidden" name="name" value={account.name} />
            <input type="hidden" name="email" value={account.email} />
          </p>
        ) : (
          <>
        <label className="block space-y-1.5">
          <span className={L.label}>Your name<Req /></span>
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
          <span className={L.label}>Your email<Req /></span>
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
        <label className={`block space-y-1.5 ${m ? "col-span-2" : ""}`}>
          <span className={L.label}>Your Instagram or streaming profile (optional)</span>
          <input className={L.input} name="sender_links" autoComplete="url" maxLength={600} placeholder="instagram.com/you, open.spotify.com/artist/…" />
          <span className={`block text-[11px] ${L.mute}`}>Up to 3 links, separated by commas. Helps the receiver know who you are.</span>
        </label>
          </>
        )}
      </div>

      <GenrePicker genres={genres} value={genre} onChange={setGenre} inputClass={L.input} labelClass={L.label} />
      <input type="hidden" name="genre" value={genre} />

      <fieldset>
        <legend className={L.label}>Mix status<Req /></legend>
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

      <label className="block space-y-1.5">
        <span className={L.label}>Release status<Req /></span>
        <select name="release_status" required className={L.input} defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          <option value="unsigned">Unreleased</option>
          <option value="signed">Signed, forthcoming</option>
          <option value="released">Already released</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className={L.label}>Message for {receiverName} (optional)</span>
        <textarea className={`${L.input} min-h-24 resize-y`} name="message" maxLength={2000} placeholder="What it is, where it fits, anything they should know. Travels privately with the track." />
      </label>

      <fieldset className="space-y-2">
        <legend className={`${L.label} mb-2`}>Did you use AI to make {many ? "these tracks" : "this track"}?<Req /></legend>
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
          Let {receiverName} play {many ? "them" : "it"} in DJ sets, live and on broadcasts. <span className={L.mute}>Leave this off and {many ? "they're" : "it's"} for listening and feedback only.</span>
        </span>
      </label>

      <p className={`text-xs ${L.mute}`}>
        <span className="text-danger">*</span> Required.{" "}
        By sending you confirm you own or control {many ? "these tracks" : "this track"}, your answer about AI is accurate, and you&apos;re 18 or over. {receiverName} may listen to it and download it to evaluate it
        {allowSharing ? `, and share it with colleagues who have FloorTest accounts, through a private link, for promotion (${sharingDownloads ? "they can listen and download" : "listen only"})` : ""}. They can play it in sets only if you tick the box above, and can&apos;t release it anywhere without a signed agreement with you.{" "}
        <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a> ·{" "}
        <a href="/privacy" target="_blank" className="underline underline-offset-4">Privacy</a>
      </p>

      {!account && <Turnstile siteKey={botCheckKey} />}
      {waiting ? (
        <EmailCode
          email={waiting.email}
          onConfirmed={() => {
            const fd = waiting.fd;
            setWaiting(null);
            send(fd);
          }}
          onCancel={() => setWaiting(null)}
        />
      ) : (
      <button className={`${L.btn} w-full py-3.5 ${m ? "text-[14px]" : "text-base"}`} disabled={busy || analyzing || checking}>
        {checking
          ? "Checking your email…"
          : busy
          ? `Uploading ${items.filter((it) => it.status === "done").length + 1} of ${items.length}…`
          : analyzing
            ? "Reading audio…"
            : many
              ? `Send ${items.length} tracks to ${receiverName}`
              : `Send to ${receiverName}`}
      </button>
      )}
    </form>
  );
}
