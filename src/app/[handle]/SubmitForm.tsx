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
import { SetsPermission } from "./SetsPermission";
import { TransferScreen } from "./TransferScreen";
import { MAX_FILES, useTrackUpload, type Item } from "./useTrackUpload";

/** Things that arrive on the page (a chosen track, a step, the result) settle in from just below. Reduced motion keeps only the fade. */
const ENTER = "starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-200 ease-[var(--ease-out)]";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.5px] text-dim";
const HELP = "text-[12px] text-dim";

/** One problem at a time, under the field it belongs to, saying what to do. */
type Issue = { key: string; text: string };

export function SubmitForm({
  handle,
  receiverName,
  genres,
  account,
  allowSharing = false,
  sharingDownloads = false,
  botCheckKey = null,
  callout = null,
  trackArt = false,
  initialFiles,
  onSent,
}: {
  handle: string;
  receiverName: string;
  genres: string[];
  /** Sending from a signed-in FloorTest account: name and email come from the account. */
  account?: { name: string; email: string };
  /** The collection lets the receiver share tracks with colleagues through a private listen-only link. */
  allowSharing?: boolean;
  /** The receiver is on a paid plan now, so colleagues can download this track (fixed at send time). */
  sharingDownloads?: boolean;
  /** Turnstile site key for anonymous senders when the bot check is on. */
  botCheckKey?: string | null;
  /** The collection (callout) receiving right now, shown while uploading. */
  callout?: string | null;
  /** The receiver's plan takes track artwork (optional for the sender). */
  trackArt?: boolean;
  /** Files already chosen, e.g. shared into the app from another app (added once, when the form opens). */
  initialFiles?: File[];
  /** Called once everything has been sent. */
  onSent?: () => void;
}) {
  const { items, phase, error, setError, sender, setSender, add, remove, edit, send, reset: resetUpload, cancel, startedAt } = useTrackUpload(handle, { asAccount: !!account });
  const [drag, setDrag] = useState(false);
  const [genre, setGenre] = useState("");
  const [mix, setMix] = useState("");
  const [setsOk, setSetsOk] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Without an account: the form waiting while the sender types the emailed code.
  const [waiting, setWaiting] = useState<{ email: string; fd: FormData } | null>(null);
  const [checking, setChecking] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  // A problem with the send (network, server) is explained in one place, and that place comes into view.
  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);
  const many = items.length > 1;
  const busy = phase === "uploading";
  const analyzing = items.some((it) => it.analyzing);

  // From the dashboard, refresh the page so the new tracks show in your Sent list.
  useEffect(() => {
    if (account && phase === "done") router.refresh();
    if (phase === "done") onSent?.();
  }, [account, phase, router, onSent]);

  // Files handed in from outside (Share to FloorTest) start in the form, once.
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current || !initialFiles?.length) return;
    preloaded.current = true;
    add(initialFiles);
  }, [initialFiles, add]);

  function reset() {
    resetUpload();
    setGenre("");
    setMix("");
    setSetsOk(false);
    setIssue(null);
    setMessageOpen(false);
    setArtOpen(false);
  }

  /** Points at the field and says what's needed; the browser's own bubbles never appear (noValidate). */
  function flag(key: string, text: string) {
    setIssue({ key, text });
    const el = document.getElementById(key);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }
  const clear = (key: string) => issue?.key === key && setIssue(null);

  /** The same rules the server applies, checked here first so the answer is next to the field. */
  function complete(fd: FormData) {
    for (const it of items) {
      if (!it.tags.title.trim()) return flag(`title-${it.id}`, "Give this track a title.");
      if (!it.tags.artist.trim()) return flag(`artist-${it.id}`, "Who's the artist?");
    }
    if (!account) {
      if (!String(fd.get("name") ?? "").trim()) return flag("sender-name", "Add your name so the receipt is yours.");
      const email = String(fd.get("email") ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flag("sender-email", "Add an email for your receipt. Nothing else is sent to it.");
      if (!String(fd.get("sender_instagram") ?? "").trim() && !String(fd.get("sender_streaming") ?? "").trim())
        return flag("sender-instagram", `Add your Instagram or a streaming profile so ${receiverName} knows who you are.`);
    }
    if (!genre) return flag("genre", `Pick a genre so ${receiverName} knows where it fits.`);
    if (!mix) return flag("mix_status", "Say how finished it is.");
    if (!String(fd.get("release_status") ?? "")) return flag("release_status", "Is it released, signed, or unreleased?");
    if (!String(fd.get("ai_use") ?? "")) return flag("ai_use", "Say whether AI was used. Honest answers keep the desk fair.");
    return true;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setIssue(null);
    if (!complete(fd)) return;
    if (account) return send(fd);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    setChecking(true);
    const r = await startEmailCheck(email, String(fd.get("cf-turnstile-response") ?? ""));
    setChecking(false);
    if (r === null) return send(fd);
    if (r === "code") return setWaiting({ email, fd });
    setError(r);
  }

  const sentTitle = many ? `${items.length} tracks` : `“${items[0]?.tags.title}”`;
  const firstToken = items.find((it) => it.token)?.token;

  /* ── Done: what happened, what happens next, and the one link that matters. ── */
  if (phase === "done" && firstToken) {
    return (
      <section role="status" className={`flex flex-col gap-5 ${ENTER}`}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-lime text-ink">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5l3.2 3L13 4.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold leading-7 text-bone">
              {sentTitle} {many ? "are" : "is"} on {receiverName}&apos;s desk.
            </h2>
            <p className="mt-1.5 text-[13px] text-mute">
              We sent {many ? "receipts" : "a receipt"} to <span className="text-bone">{account?.email ?? sender.email}</span>. Nothing else to do.
            </p>
          </div>
        </div>
        <ol className="grid grid-cols-3 gap-2 border-y border-line py-3 text-[11px] uppercase tracking-[0.5px]">
          {(["Delivered", "Listened", "Replied"] as const).map((step, i) => (
            <li key={step} className={`flex items-center gap-1.5 ${i === 0 ? "text-lime" : "text-dim"}`}>
              <span aria-hidden className={`size-1.5 rounded-full ${i === 0 ? "bg-lime" : "bg-line-2"}`} />
              {step}
              {i === 0 && <span className="sr-only"> (done)</span>}
            </li>
          ))}
        </ol>
        <p className={HELP}>You&apos;ll get an email at each step: when {many ? "they're" : "it's"} listened to, downloaded or replied to.</p>
        <div className="flex flex-wrap gap-2.5">
          <Link href={many ? "/sent" : `/receipt/${firstToken}`} className="btn-lime">
            {many ? "See your receipts" : "View receipt"}
          </Link>
          <button type="button" onClick={reset} className="btn-ghost">
            Send another
          </button>
        </div>
      </section>
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
    <p ref={alertRef} role="alert" className={`rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger ${ENTER}`}>
      {error}
    </p>
  );
  const problem = (key: string) =>
    issue?.key === key ? (
      <p id={`${key}-issue`} role="alert" className={`text-[12px] text-danger ${ENTER}`}>
        {issue.text}
      </p>
    ) : null;
  const invalid = (key: string) => (issue?.key === key ? "border-danger/60" : "");

  /* ── Step 1: the only thing asked for is the file. ── */
  if (!items.length) {
    return (
      <div className="flex flex-col gap-3">
        <div
          {...dropProps}
          className={`flex flex-col items-center gap-3 rounded-panel border border-dashed px-4 py-9 text-center transition-colors duration-150 ${drag ? "border-lime bg-lime/5" : "border-line-2"}`}
        >
          {fileInput}
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-lime px-6 py-3.5 text-[14px] font-bold">
            Choose WAV or MP3
          </button>
          <p className={HELP}>
            or drop {MAX_FILES > 1 ? "them" : "it"} here · up to {MAX_FILES} tracks, 250 MB
          </p>
        </div>
        {errorBox}
      </div>
    );
  }

  /* ── Step 2: confirm what we read from the file, then the essentials. ── */
  const row = (it: Item, i: number) => (
    <li key={it.id} id={`track-${it.id}`} className={`flex flex-col gap-3 ${many ? "py-4 first:pt-0 last:pb-0" : ""} ${ENTER}`}>
      <div className="flex items-center gap-3">
        {many && <span className="w-4 shrink-0 text-[12px] text-dim tnum">{i + 1}</span>}
        <p className="min-w-0 flex-1 truncate text-[12px] text-dim">
          {it.file.name} · {/\.wav$/i.test(it.file.name) ? "WAV" : "MP3"} · {fmtBytes(it.file.size)}
          {it.analysis && ` · ${fmtTime(it.analysis.duration)}`}
          {(it.tags.bpm ?? it.analysis?.bpm) && ` · ${Math.round((it.tags.bpm ?? it.analysis?.bpm)!)} BPM`}
          {it.tags.key && ` · ${it.tags.key}`}
        </p>
        {it.status === "done" ? (
          <span className="text-[12px] text-lime">Sent</span>
        ) : (
          !busy && (
            <button type="button" onClick={() => remove(it.id)} className="-my-2 inline-flex min-h-9 items-center px-1 text-[12px] text-dim underline underline-offset-4 hover:text-bone" aria-label={`Remove ${it.file.name}`}>
              Remove
            </button>
          )
        )}
      </div>
      {!many && <Waveform peaks={it.analysis?.peaks ?? null} progress={0} height={44} dim={it.analyzing} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5" htmlFor={`title-${it.id}`}>
          <span className={LABEL}>Track title<Req /></span>
          <input id={`title-${it.id}`} className={`input ${invalid(`title-${it.id}`)}`} required value={it.tags.title} disabled={it.status === "done"} aria-describedby={issue?.key === `title-${it.id}` ? `title-${it.id}-issue` : undefined} onChange={(e) => (clear(`title-${it.id}`), edit(it.id, { title: e.target.value }))} />
          {problem(`title-${it.id}`)}
        </label>
        <label className="block space-y-1.5" htmlFor={`artist-${it.id}`}>
          <span className={LABEL}>Artist<Req /></span>
          <input id={`artist-${it.id}`} className={`input ${invalid(`artist-${it.id}`)}`} required value={it.tags.artist} disabled={it.status === "done"} aria-describedby={issue?.key === `artist-${it.id}` ? `artist-${it.id}-issue` : undefined} onChange={(e) => (clear(`artist-${it.id}`), edit(it.id, { artist: e.target.value }))} />
          {problem(`artist-${it.id}`)}
        </label>
      </div>
      {many && it.error && <p className="text-[12px] text-danger">{it.error}</p>}
    </li>
  );

  return (
    <>
      {busy && (
        <TransferScreen
          receiverName={receiverName}
          handle={handle}
          callout={callout}
          startedAt={startedAt}
          onCancel={cancel}
          files={items.map((it) => ({ name: it.file.name, size: it.file.size, progress: it.progress, state: it.status === "done" ? "sent" : it.status === "uploading" ? "sending" : it.status === "error" ? "failed" : "waiting" }))}
        />
      )}
      {waiting && (
        <EmailCode
          email={waiting.email}
          receiverName={receiverName}
          sending={items.map((it) => `${it.tags.title || it.file.name}${it.tags.artist ? ` · ${it.tags.artist}` : ""}`)}
          onConfirmed={() => {
            const fd = waiting.fd;
            setWaiting(null);
            send(fd);
          }}
          onCancel={() => setWaiting(null)}
        />
      )}
      <p role="status" className="sr-only">
        {busy ? `Uploading track ${Math.min(items.filter((it) => it.status === "done").length + 1, items.length)} of ${items.length}` : ""}
      </p>
      <form onSubmit={submit} noValidate data-picked className={waiting || busy ? "hidden" : "flex flex-col gap-7"} {...dropProps}>
        {fileInput}

        <section aria-labelledby="tracks-h" className="flex flex-col gap-3">
          <h2 id="tracks-h" className="eyebrow">{many ? `Your ${items.length} tracks` : "Your track"}</h2>
          <ol className={many ? "divide-y divide-line" : ""}>{items.map(row)}</ol>
          {items.length < MAX_FILES && (
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex min-h-9 w-fit items-center gap-1.5 text-[13px] font-semibold text-bone underline-offset-4 hover:underline">
              <span aria-hidden className="text-lime">+</span> Add another track <span className="font-normal text-dim">({MAX_FILES - items.length} more)</span>
            </button>
          )}
        </section>

        {account ? (
          <p className="text-[12px] text-dim">
            Sending as <span className="text-bone">{account.name}</span> ({account.email}). Updates go to your FloorTest account.
            <input type="hidden" name="name" value={account.name} />
            <input type="hidden" name="email" value={account.email} />
          </p>
        ) : (
          <section aria-labelledby="you-h" className="flex flex-col gap-3">
            <h2 id="you-h" className="eyebrow">You</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="sender-name">
                <span className={LABEL}>Your name<Req /></span>
                <input id="sender-name" className={`input ${invalid("sender-name")}`} name="name" required autoComplete="name" value={sender.name} aria-describedby={issue?.key === "sender-name" ? "sender-name-issue" : undefined} onChange={(e) => (clear("sender-name"), setSender((s) => ({ ...s, name: e.target.value })))} />
                {problem("sender-name")}
              </label>
              <label className="block space-y-1.5" htmlFor="sender-email">
                <span className={LABEL}>Your email<Req /></span>
                <input id="sender-email" className={`input ${invalid("sender-email")}`} name="email" type="email" required autoComplete="email" value={sender.email} aria-describedby={issue?.key === "sender-email" ? "sender-email-issue" : "sender-email-help"} onChange={(e) => (clear("sender-email"), setSender((s) => ({ ...s, email: e.target.value })))} />
                {problem("sender-email")}
              </label>
            </div>
            {issue?.key !== "sender-email" && <p id="sender-email-help" className={`-mt-1 ${HELP}`}>For your receipt and updates only. Never shown to anyone.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="sender-instagram">
                <span className={LABEL}>Instagram</span>
                <input id="sender-instagram" className={`input ${invalid("sender-instagram")}`} name="sender_instagram" autoComplete="off" maxLength={300} placeholder="@yourname" value={sender.instagram} aria-describedby={issue?.key === "sender-instagram" ? "sender-instagram-issue" : "profiles-help"} onChange={(e) => (clear("sender-instagram"), setSender((s) => ({ ...s, instagram: e.target.value })))} />
                {problem("sender-instagram")}
              </label>
              <label className="block space-y-1.5" htmlFor="sender-streaming">
                <span className={LABEL}>Streaming profile</span>
                <input id="sender-streaming" className="input" name="sender_streaming" inputMode="url" autoComplete="url" maxLength={300} placeholder="open.spotify.com/artist/…" value={sender.streaming} aria-describedby="profiles-help" onChange={(e) => (clear("sender-instagram"), setSender((s) => ({ ...s, streaming: e.target.value })))} />
              </label>
            </div>
            {issue?.key !== "sender-instagram" && <p id="profiles-help" className={`-mt-1 ${HELP}`}>One of these, so {receiverName} knows who you are.</p>}
          </section>
        )}

        <section aria-labelledby="about-h" className="flex flex-col gap-3">
          <h2 id="about-h" className="eyebrow">About {many ? "these tracks" : "this track"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <GenrePicker id="genre" genres={genres} value={genre} onChange={(g) => (clear("genre"), setGenre(g))} inputClass="input" labelClass={LABEL} invalid={issue?.key === "genre"} issue={problem("genre")} />
            <input type="hidden" name="genre" value={genre} />
            <label className="block space-y-1.5" htmlFor="mix_status">
              <span className={LABEL}>Mix status<Req /></span>
              <select id="mix_status" name="mix_status" required className={`input ${invalid("mix_status")}`} value={mix} aria-describedby={issue?.key === "mix_status" ? "mix_status-issue" : undefined} onChange={(e) => (clear("mix_status"), setMix(e.target.value))}>
                <option value="" disabled>
                  Choose one
                </option>
                {Object.entries(MIX_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {problem("mix_status")}
            </label>
            <label className="block space-y-1.5" htmlFor="release_status">
              <span className={LABEL}>Release status<Req /></span>
              <select id="release_status" name="release_status" required className={`input ${invalid("release_status")}`} defaultValue="" aria-describedby={issue?.key === "release_status" ? "release_status-issue" : undefined} onChange={() => clear("release_status")}>
                <option value="" disabled>
                  Choose one
                </option>
                <option value="unsigned">Unreleased</option>
                <option value="signed">Signed, forthcoming</option>
                <option value="released">Already released</option>
              </select>
              {problem("release_status")}
            </label>
            <label className="block space-y-1.5" htmlFor="ai_use">
              <span className={LABEL}>Made with AI?<Req /></span>
              <select id="ai_use" name="ai_use" required className={`input ${invalid("ai_use")}`} defaultValue="" aria-describedby={issue?.key === "ai_use" ? "ai_use-issue" : undefined} onChange={() => clear("ai_use")}>
                <option value="" disabled>
                  Choose one
                </option>
                <option value="none">No</option>
                <option value="partial">Partly (e.g. AI vocals, stems or mastering)</option>
                <option value="full">Fully AI-generated</option>
              </select>
              {problem("ai_use")}
            </label>
          </div>

          {/* Optional extras stay out of the way until asked for. */}
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {!messageOpen && (
              <button type="button" onClick={() => setMessageOpen(true)} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-bone underline-offset-4 hover:underline">
                <span aria-hidden className="mr-1.5 text-lime">+</span> Add a message for {receiverName}
              </button>
            )}
            {trackArt && !artOpen && (
              <button type="button" onClick={() => setArtOpen(true)} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-bone underline-offset-4 hover:underline">
                <span aria-hidden className="mr-1.5 text-lime">+</span> Add artwork
              </button>
            )}
          </div>
          {messageOpen && (
            <label className={`block space-y-1.5 ${ENTER}`} htmlFor="message">
              <span className={LABEL}>Message for {receiverName}</span>
              <textarea id="message" className="input min-h-24 resize-y" name="message" maxLength={2000} autoFocus placeholder="What it is, where it fits, anything they should know. Travels privately with the track." />
            </label>
          )}
          {trackArt && artOpen && (
            <label className={`block space-y-1.5 ${ENTER}`} htmlFor="artwork">
              <span className={LABEL}>Artwork</span>
              <input id="artwork" type="file" name="artwork" accept="image/jpeg,image/png,image/webp" disabled={busy} className="input file:mr-3 file:rounded file:border-0 file:bg-ink-3 file:px-3 file:py-1 file:text-bone" />
              <span className={`block ${HELP}`}>JPG, PNG or WebP, up to 25 MB. Sent at full quality. {many ? "Goes with every track in this send." : ""}</span>
            </label>
          )}
        </section>

        <SetsPermission receiverName={receiverName} many={many} checked={setsOk} onChange={setSetsOk} disabled={busy} />

        {errorBox}

        <div className="flex flex-col gap-3">
          {!account && <Turnstile siteKey={botCheckKey} />}
          <button className="btn-lime w-full py-3.5 text-[14px] font-bold" disabled={busy || analyzing || checking}>
            {checking ? "Checking your email…" : analyzing ? "Reading audio…" : many ? `Send ${items.length} tracks to ${receiverName}` : `Send to ${receiverName}`}
          </button>
          <p className="text-[11px] leading-4 text-dim">
            By sending you confirm you own or control {many ? "these tracks" : "this track"}, your answer about AI is accurate, and you&apos;re 18 or over. {receiverName} may listen to it and download it to evaluate it
            {allowSharing ? `, and share it with colleagues who have FloorTest accounts, through a private link, for promotion (${sharingDownloads ? "they can listen and download" : "listen only"})` : ""}. They can play it in sets only if you turn on DJ sets above, and can&apos;t release it anywhere without a signed agreement with you.{" "}
            <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a> ·{" "}
            <a href="/privacy" target="_blank" className="underline underline-offset-4">Privacy</a>
          </p>
        </div>
      </form>
    </>
  );
}
