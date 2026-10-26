"use client";

import { Req } from "@/components/Req";
import { Turnstile } from "@/components/Turnstile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { fmtBytes, fmtTime } from "@/lib/format";
import { EmailCode, startEmailCheck } from "./EmailCode";
import { GenrePicker } from "./GenrePicker";
import { SetsPermission } from "./SetsPermission";
import { TransferScreen } from "./TransferScreen";
import { MAX_FILES, SENDER_KEY, useTrackUpload, type Item } from "./useTrackUpload";
import { stored, useBrowserValue } from "@/components/useBrowserValue";
import { AI_CHOICES, AI_HELP, Choice, MIX_CHOICES, RELEASE_CHOICES } from "./Choice";

/** Things that arrive on the page (a chosen track, a step, the result) settle in from just below. Reduced motion keeps only the fade. */
const ENTER = "starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-200 ease-[var(--ease-out)]";
const LABEL = "text-[11px] font-bold uppercase tracking-[1px] text-dim";
const HELP = "text-[12px] text-dim";

/** Smooth scrolling, unless the person has asked their device for less motion. */
const scrollBehavior = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * The text answers, kept for this tab only (sessionStorage) while the sender fetches the emailed code, so a reload
 * doesn't lose them. Never the files, the code or anything secret; cleared once the send goes through.
 */
type Draft = { genre?: string; mix?: string; release?: string; ai?: string; message?: string; sender?: { name: string; email: string; instagram: string; streaming: string } };
const draftKey = (handle: string) => `floortest.draft.${handle.toLowerCase()}`;
/**
 * The draft as it was when the form opened, read once per mount: the form's own later saves must never be read back
 * into the fields mid-typing. Forgotten on unmount, so coming back to the page reads the latest draft.
 */
const draftAtOpen = new Map<string, string>();
function readDraftOnce(handle: string) {
  const k = draftKey(handle);
  if (!draftAtOpen.has(k)) draftAtOpen.set(k, stored(k, "session"));
  return draftAtOpen.get(k)!;
}
function writeDraft(handle: string, d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(draftKey(handle), JSON.stringify(d));
    else sessionStorage.removeItem(draftKey(handle));
  } catch {}
}

/** Something still needed: under its field it says what to do (`text`); above Send it's named in a word or two (`short`). */
type Issue = { key: string; short: string; text: string };

export function SubmitForm({
  handle,
  receiverName,
  genres,
  account,
  allowSharing = false,
  botCheckKey = null,
  callout = null,
  trackArt = false,
  initialFiles,
  onSent,
  presetGenre = "",
  bpmRange = null,
  promise = [],
}: {
  handle: string;
  receiverName: string;
  genres: string[];
  /** Sending from a signed-in FloorTest account: name and email come from the account. */
  account?: { name: string; email: string };
  /** The collection lets the receiver share tracks privately with people they name (collection share links). */
  allowSharing?: boolean;
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
  /** A genre the sender tapped in the receiver's brief; it fills the Genre field. */
  presetGenre?: string;
  /** The BPM range the receiver asked for, shown next to each track's own BPM. */
  bpmRange?: [number, number] | null;
  /** What happens to the file (who hears it, deletion, receipt), repeated above Send. */
  promise?: string[];
}) {
  const { items, phase, error, setError, sender, setSender, remembered, artFailed, add, remove, edit, send, reset: resetUpload, cancel, startedAt } = useTrackUpload(handle, { asAccount: !!account });
  const [drag, setDrag] = useState(false);
  // The sender's own pick wins; until they make one, a genre tapped in the brief fills the field.
  const [chosenGenre, setGenre] = useState<string | null>(null);
  const genre = chosenGenre ?? presetGenre;
  const [mix, setMix] = useState("");
  const [release, setRelease] = useState("");
  const [ai, setAi] = useState("");
  const [setsOk, setSetsOk] = useState(false);
  // Everything still missing, each shown under its field and listed together above Send.
  const [issues, setIssues] = useState<Issue[]>([]);
  // Details remembered on this device show as one line until the sender asks to change them.
  const [changeYou, setChangeYou] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Without an account: the form waiting while the sender types the emailed code.
  const [waiting, setWaiting] = useState<{ email: string; fd: FormData } | null>(null);
  const [checking, setChecking] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();
  const doneRef = useRef<HTMLElement>(null);

  // Answers kept from before a reload in this tab come back once, straight after hydration.
  const draft = useBrowserValue(() => readDraftOnce(handle), "");
  useEffect(() => () => void draftAtOpen.delete(draftKey(handle)), [handle]);
  const [draftSeen, setDraftSeen] = useState("");
  // Answers came back but the files couldn't (browsers never keep them): say so once a file is needed.
  const [restored, setRestored] = useState(false);
  if (draft !== draftSeen) {
    setDraftSeen(draft);
    try {
      const d = JSON.parse(draft || "null") as Draft | null;
      if (d) {
        if (d.genre) setGenre(d.genre);
        if (d.mix) setMix(d.mix);
        if (d.release) setRelease(d.release);
        if (d.ai) setAi(d.ai);
        if (d.message) {
          setMessage(d.message);
          setMessageOpen(true);
        }
        if (!account && d.sender && (d.sender.name || d.sender.email || d.sender.instagram || d.sender.streaming)) {
          const { name = "", email = "", instagram = "", streaming = "" } = d.sender;
          setSender({ name, email, instagram, streaming });
          // Details typed before the reload that differ from the ones remembered on this device stay open to edit.
          const kept = JSON.parse(stored(SENDER_KEY) || "null") as Partial<Draft["sender"]> | null;
          if (!kept || kept.name !== name || kept.email !== email || (kept.instagram ?? "") !== instagram || (kept.streaming ?? "") !== streaming) setChangeYou(true);
        }
        setRestored(true);
      }
    } catch {}
  }
  // Saved only after the sender has touched the form, so a fresh page never writes over a draft before it's read back.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current || phase !== "idle") return;
    writeDraft(handle, { genre: chosenGenre ?? undefined, mix, release, ai, message, sender: account ? undefined : sender });
  }, [handle, account, phase, chosenGenre, mix, release, ai, message, sender]);

  // A problem with the send (network, server) is explained in one place, and that place comes into view.
  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }, [error]);
  const many = items.length > 1;
  const busy = phase === "uploading";
  // The moment it's sent, the bar holds at full for 200ms before the done screen replaces it, so the sender sees it
  // reach the end rather than vanish short of it.
  const [prevPhase, setPrevPhase] = useState(phase);
  const [holding, setHolding] = useState(false);
  if (phase !== prevPhase) {
    setPrevPhase(phase);
    setHolding(prevPhase === "uploading" && phase === "done");
  }
  useEffect(() => {
    if (!holding) return;
    const t = setTimeout(() => setHolding(false), 200);
    return () => clearTimeout(t);
  }, [holding]);
  const transferring = busy || holding;
  const showDone = phase === "done" && !holding;
  const analyzing = items.some((it) => it.analyzing);

  // From the dashboard, refresh the page so the new tracks show in your Sent list.
  useEffect(() => {
    if (account && phase === "done") router.refresh();
    if (phase === "done") {
      // Sent: nothing left to keep for this tab.
      touched.current = false;
      writeDraft(handle, null);
      onSent?.();
    }
  }, [account, phase, router, onSent, handle]);
  // The page above folds away (data-picked on the done screen), so bring the confirmation to the top once it shows.
  useEffect(() => {
    if (showDone) requestAnimationFrame(() => doneRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() }));
  }, [showDone]);

  // Files handed in from outside (Share to FloorTest) start in the form, once.
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current || !initialFiles?.length) return;
    preloaded.current = true;
    add(initialFiles);
  }, [initialFiles, add]);

  function reset() {
    resetUpload();
    setGenre(null);
    setMix("");
    setRelease("");
    setAi("");
    setSetsOk(false);
    setIssues([]);
    setMessageOpen(false);
    setMessage("");
    setArtOpen(false);
    setRestored(false);
  }

  /** Moves to a field that needs an answer; the browser's own bubbles never appear (noValidate). */
  function goTo(key: string) {
    const el = document.getElementById(key);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }
  const issueFor = (key: string) => issues.find((i) => i.key === key);
  const clear = (key: string) => issueFor(key) && setIssues((list) => list.filter((i) => i.key !== key));

  /** The same rules the server applies, all checked at once so every answer still needed is shown together. */
  function complete(fd: FormData) {
    const found: Issue[] = [];
    const need = (key: string, short: string, text: string) => found.push({ key, short, text });
    for (const it of items) {
      if (!it.tags.title.trim()) need(`title-${it.id}`, "title", "Give this track a title.");
      if (!it.tags.artist.trim()) need(`artist-${it.id}`, "artist", "Who's the artist?");
    }
    if (!account) {
      if (!String(fd.get("name") ?? "").trim()) need("sender-name", "your name", "Add your name so the receipt is yours.");
      const email = String(fd.get("email") ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) need("sender-email", "your email", "Add an email for your receipt. Nothing else is sent to it.");
      if (!String(fd.get("sender_instagram") ?? "").trim() && !String(fd.get("sender_streaming") ?? "").trim())
        need("sender-instagram", "a profile", `Add your Instagram or a streaming profile so ${receiverName} knows who you are.`);
    }
    if (!genre) need("genre", "genre", `Pick a genre so ${receiverName} knows where it fits.`);
    if (!mix) need("mix_status", "mix status", "Say how finished it is.");
    if (!release) need("release_status", "release status", "Is it released, signed, or unreleased?");
    if (!ai) need("ai_use", "AI use", "Say whether AI was used. Honest answers keep the desk fair.");
    if (!found.length) return true;
    // A remembered sender line hides the fields; open them if one of them is the problem.
    if (found.some((i) => i.key.startsWith("sender-"))) setChangeYou(true);
    setIssues(found);
    requestAnimationFrame(() => goTo(found[0].key));
    return false;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setIssues([]);
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
  if (showDone && firstToken) {
    return (
      <section ref={doneRef} role="status" data-picked className={`flex scroll-mt-6 flex-col gap-5 ${ENTER}`}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-lime text-ink">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {/* The tick draws itself once (300ms ease-out, after 100ms). Reduced motion: it's simply there. */}
              <path d="M3 8.5l3.2 3L13 4.5" pathLength={1} strokeDasharray={1} className="[stroke-dashoffset:0] transition-[stroke-dashoffset] delay-100 duration-300 ease-[var(--ease-out)] starting:[stroke-dashoffset:1] motion-reduce:transition-none" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.5px] text-bone">
              {sentTitle} {many ? "are" : "is"} on {receiverName}&apos;s desk.
            </h2>
            <p className="mt-1.5 text-[13px] text-mute">
              We sent {many ? "receipts" : "a receipt"} to <span className="text-bone">{account?.email ?? sender.email}</span>. Nothing else to do.
            </p>
          </div>
        </div>
        <ol className="grid grid-cols-2 gap-2 border-y border-line py-3 text-[11px] font-bold uppercase tracking-[1px] sm:grid-cols-4">
          {(["Delivered", "Listened", "Downloaded", "Replied"] as const).map((step, i) => (
            <li key={step} className={`flex items-center gap-1.5 ${i === 0 ? "text-lime" : "text-dim"}`}>
              <span aria-hidden className={`size-1.5 rounded-full ${i === 0 ? "bg-lime" : "bg-line-2"}`} />
              {step}
              {i === 0 && <span className="sr-only"> (done)</span>}
            </li>
          ))}
        </ol>
        <p className={HELP}>You&apos;ll get an email at each step: when {many ? "they're" : "it's"} listened to, downloaded or replied to.</p>
        {artFailed && <p className="text-[13px] text-mute">The artwork didn&apos;t upload. {many ? "The tracks were" : "The track was"} sent without it.</p>}
        {many && (
          <ul className="flex flex-col gap-1.5 text-[13px]" aria-label="Receipts">
            {items
              .filter((it) => it.token)
              .map((it) => (
                <li key={it.id}>
                  <Link href={`/receipt/${it.token}`} className="inline-flex min-h-9 items-center underline underline-offset-4">
                    Receipt for “{it.tags.title || it.file.name}”
                  </Link>
                </li>
              ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2.5">
          {!many && (
            <Link href={`/receipt/${firstToken}`} className="btn-lime">
              View receipt
            </Link>
          )}
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
  const problem = (key: string) => {
    const it = issueFor(key);
    return it ? (
      <p id={`${key}-issue`} className={`text-[12px] text-danger ${ENTER}`}>
        {it.text}
      </p>
    ) : null;
  };
  const invalid = (key: string) => (issueFor(key) ? "border-danger/60" : "");
  const isInvalid = (key: string) => (issueFor(key) ? true : undefined);
  const described = (key: string, help?: string) => (issueFor(key) ? `${key}-issue` : help);

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
        {restored && <p className="text-[13px] text-mute">Pick your files again: your details are still here.</p>}
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
          {bpmRange && (it.tags.bpm ?? it.analysis?.bpm) && (() => {
            const bpm = Math.round((it.tags.bpm ?? it.analysis?.bpm)!);
            const inside = bpm >= bpmRange[0] && bpm <= bpmRange[1];
            return <span className={inside ? "text-bone" : undefined}>{` (${inside ? "in" : "outside"} the ${bpmRange[0]}–${bpmRange[1]} asked for)`}</span>;
          })()}
          {it.tags.key && ` · ${it.tags.key}`}
        </p>
        {it.status === "done" ? (
          <span className="text-[12px] text-lime">Sent</span>
        ) : (
          !busy && (
            <button type="button" onClick={() => remove(it.id)} className="-my-3 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[12px] text-dim underline underline-offset-4 hover:text-bone" aria-label={`Remove ${it.file.name}`}>
              Remove
            </button>
          )
        )}
      </div>
      {!many && <Waveform peaks={it.analysis?.peaks ?? null} progress={0} height={44} dim={it.analyzing} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5" htmlFor={`title-${it.id}`}>
          <span className={LABEL}>Track title<Req /></span>
          <input id={`title-${it.id}`} className={`input ${invalid(`title-${it.id}`)}`} required value={it.tags.title} disabled={it.status === "done"} aria-invalid={isInvalid(`title-${it.id}`)} aria-describedby={described(`title-${it.id}`)} onChange={(e) => (clear(`title-${it.id}`), edit(it.id, { title: e.target.value }))} />
          {problem(`title-${it.id}`)}
        </label>
        <label className="block space-y-1.5" htmlFor={`artist-${it.id}`}>
          <span className={LABEL}>Artist<Req /></span>
          <input id={`artist-${it.id}`} className={`input ${invalid(`artist-${it.id}`)}`} required value={it.tags.artist} disabled={it.status === "done"} aria-invalid={isInvalid(`artist-${it.id}`)} aria-describedby={described(`artist-${it.id}`)} onChange={(e) => (clear(`artist-${it.id}`), edit(it.id, { artist: e.target.value }))} />
          {problem(`artist-${it.id}`)}
        </label>
      </div>
      {many && it.error && <p className="text-[12px] text-danger">{it.error}</p>}
    </li>
  );

  return (
    <>
      {transferring && (
        <TransferScreen
          receiverName={receiverName}
          handle={handle}
          callout={callout}
          startedAt={startedAt}
          onCancel={holding ? () => {} : cancel}
          retry={items.find((it) => it.retry)?.retry}
          checking={items.some((it) => it.checking)}
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
      {/* The one place screen readers hear upload progress: milestones only (which track, each quarter, each track sent). */}
      <p role="status" className="sr-only">
        {busy ? uploadMilestone(items) : ""}
      </p>
      <form onSubmit={submit} noValidate data-picked className={waiting || transferring ? "hidden" : "flex flex-col gap-7"} onChange={() => (touched.current = true)} onClick={() => (touched.current = true)} {...dropProps}>
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
        ) : remembered && !changeYou ? (
          <section aria-labelledby="you-h" className="flex flex-col gap-2">
            <h2 id="you-h" className="eyebrow">You</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mute">
              <span className="min-w-0 break-words">
                Sending as <span className="font-semibold text-bone">{sender.name}</span> · {sender.email}
                {sender.instagram ? ` · ${sender.instagram}` : sender.streaming ? " · streaming profile" : ""}
              </span>
              <button type="button" onClick={() => setChangeYou(true)} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-bone underline underline-offset-4">
                Change
              </button>
            </p>
            <input type="hidden" name="name" value={sender.name} />
            <input type="hidden" name="email" value={sender.email} />
            <input type="hidden" name="sender_instagram" value={sender.instagram} />
            <input type="hidden" name="sender_streaming" value={sender.streaming} />
          </section>
        ) : (
          <section aria-labelledby="you-h" className="flex flex-col gap-3">
            <h2 id="you-h" className="eyebrow">You</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="sender-name">
                <span className={LABEL}>Your name<Req /></span>
                <input id="sender-name" className={`input ${invalid("sender-name")}`} name="name" required autoComplete="name" value={sender.name} aria-invalid={isInvalid("sender-name")} aria-describedby={described("sender-name")} onChange={(e) => (clear("sender-name"), setSender((s) => ({ ...s, name: e.target.value })))} />
                {problem("sender-name")}
              </label>
              <label className="block space-y-1.5" htmlFor="sender-email">
                <span className={LABEL}>Your email<Req /></span>
                <input id="sender-email" className={`input ${invalid("sender-email")}`} name="email" type="email" required autoComplete="email" value={sender.email} aria-invalid={isInvalid("sender-email")} aria-describedby={described("sender-email", "sender-email-help")} onChange={(e) => (clear("sender-email"), setSender((s) => ({ ...s, email: e.target.value })))} />
                {problem("sender-email")}
              </label>
            </div>
            {!issueFor("sender-email") && <p id="sender-email-help" className={`-mt-1 ${HELP}`}>For your receipt and updates only. Never shown to anyone.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="sender-instagram">
                <span className={LABEL}>Instagram</span>
                <input id="sender-instagram" className={`input ${invalid("sender-instagram")}`} name="sender_instagram" autoComplete="off" maxLength={300} placeholder="@yourname" value={sender.instagram} aria-invalid={isInvalid("sender-instagram")} aria-describedby={described("sender-instagram", "profiles-help")} onChange={(e) => (clear("sender-instagram"), setSender((s) => ({ ...s, instagram: e.target.value })))} />
                {problem("sender-instagram")}
              </label>
              <label className="block space-y-1.5" htmlFor="sender-streaming">
                <span className={LABEL}>Streaming profile</span>
                <input id="sender-streaming" className="input" name="sender_streaming" inputMode="url" autoComplete="url" maxLength={300} placeholder="open.spotify.com/artist/…" value={sender.streaming} aria-invalid={isInvalid("sender-instagram")} aria-describedby={described("sender-instagram", "profiles-help")} onChange={(e) => (clear("sender-instagram"), setSender((s) => ({ ...s, streaming: e.target.value })))} />
              </label>
            </div>
            {!issueFor("sender-instagram") && <p id="profiles-help" className={`-mt-1 ${HELP}`}>One of these, so {receiverName} knows who you are.</p>}
          </section>
        )}

        <section aria-labelledby="about-h" className="flex flex-col gap-3">
          <h2 id="about-h" className="eyebrow">About {many ? "these tracks" : "this track"}</h2>
          <GenrePicker id="genre" genres={genres} value={genre} onChange={(g) => (clear("genre"), setGenre(g))} inputClass="input" labelClass={LABEL} invalid={!!issueFor("genre")} issue={problem("genre")} />
          <input type="hidden" name="genre" value={genre} />
          <Choice id="mix_status" name="mix_status" label="Mix status" value={mix} onChange={(v) => (clear("mix_status"), setMix(v))} issue={problem("mix_status")} options={MIX_CHOICES} />
          <Choice id="release_status" name="release_status" label="Release status" value={release} onChange={(v) => (clear("release_status"), setRelease(v))} issue={problem("release_status")} options={RELEASE_CHOICES} />
          <Choice
            id="ai_use"
            name="ai_use"
            label="Made with AI?"
            value={ai}
            onChange={(v) => (clear("ai_use"), setAi(v))}
            issue={problem("ai_use")}
            options={AI_CHOICES}
            help={AI_HELP}
          />

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
              <textarea id="message" className="input min-h-24 resize-y" name="message" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus placeholder="What it is, where it fits, anything they should know. Travels privately with the track." />
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

        {!account && <Turnstile action="send" siteKey={botCheckKey} />}
        <div className="flex flex-col gap-3">
          {issues.length > 0 && (
            <div role="alert" className={`rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger ${ENTER}`}>
              {issues.length === 1 ? "One thing left: " : `${issues.length} things left: `}
              {issues.map((it, i) => (
                <span key={it.key}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => goTo(it.key)} className="underline underline-offset-4">
                    {it.short}
                  </button>
                </span>
              ))}
              .
            </div>
          )}
          {promise.length > 0 && (
            <ul aria-label="What happens to your file" className="flex flex-col gap-1.5 text-[13px] leading-5 text-mute">
              {promise.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden>→</span>
                  {line}
                </li>
              ))}
            </ul>
          )}
          {/* On phones the send button stays within reach at the bottom of the screen while the form scrolls. */}
          <div className="max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-[18px] max-sm:border-t max-sm:border-line max-sm:bg-ink max-sm:px-[18px] max-sm:pt-3 max-sm:pb-[max(12px,env(safe-area-inset-bottom))]">
            <button className="btn-lime w-full py-3.5 text-[14px] font-bold" disabled={busy || analyzing || checking}>
              {checking ? "Checking your email…" : analyzing ? "Reading audio…" : many ? `Send ${items.length} tracks to ${receiverName}` : `Send to ${receiverName}`}
            </button>
          </div>
          <p className="text-[12px] leading-[18px] text-dim">
            By sending you confirm you own or control {many ? "these tracks" : "this track"}, your answer about AI is accurate, and you&apos;re 18 or over. {receiverName} may listen to it and download it to evaluate it. They can play it in sets only if you turn on DJ sets above, and can&apos;t release it anywhere without a signed agreement with you.
            {/* Draft wording (lawyer brief 11 Oct, 4.1); the version agreed to is stored on the track (SHARING_TERMS_VERSION). */}
            {allowSharing
              ? ` ${receiverName} can also share it privately, through FloorTest, with people they name, who must confirm their email first. Depending on what ${receiverName} allows, those people can listen, or listen and download. Nobody can publish or release it without a signed agreement with you.`
              : ""}{" "}
            <a href="/terms" target="_blank" className="underline underline-offset-4">Terms</a> ·{" "}
            <a href="/privacy" target="_blank" className="underline underline-offset-4">Privacy</a>
          </p>
        </div>
      </form>
    </>
  );
}

/** "Uploading track 2 of 3", then each quarter, and "Track 1 sent" as the next one starts. Changes only at milestones. */
function uploadMilestone(items: Item[]) {
  const done = items.filter((it) => it.status === "done").length;
  const current = items.find((it) => it.status === "uploading");
  const n = items.length;
  if (!current) return done ? `Track ${done} sent` : "";
  const which = n > 1 ? `track ${done + 1} of ${n}` : "your track";
  if (current.retry) return `Signal dropped. Trying ${which} again, ${current.retry.attempt} of ${current.retry.of}`;
  if (current.checking) return `Uploaded. Checking ${which} for viruses, this can take up to a minute`;
  const quarter = Math.floor(current.progress * 4) * 25;
  if (quarter > 0) return `Uploading ${which}: ${quarter} percent`;
  return `${done ? `Track ${done} sent. ` : ""}Uploading ${which}`;
}
