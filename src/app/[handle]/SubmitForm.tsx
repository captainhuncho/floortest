"use client";

import { Req } from "@/components/Req";
import { Turnstile } from "@/components/Turnstile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Kit";
import { fmtBytes, fmtTime } from "@/lib/format";
import { maskEmail } from "@/lib/mask-email";
import { EmailCode, startEmailCheck, type TermsState } from "./EmailCode";
import { GenrePicker } from "./GenrePicker";
import { FileRow, TransferScreen } from "./TransferScreen";
import { TermsTick } from "./TermsTick";
import { MAX_FILES, SENDER_KEY, useTrackUpload, type Item } from "./useTrackUpload";
import { stored, useBrowserValue } from "@/components/useBrowserValue";
import { recallSender } from "@/lib/sender-memory";
import { AI_CHOICES, AI_HELP, Choice, MIX_CHOICES, PLAY_CHOICES, RELEASE_CHOICES, playHelp } from "./Choice";
import { normalEmail } from "@/lib/email-normal";

/** Things that arrive on the page (a chosen track, a step, the result) settle in from just below. Reduced motion keeps only the fade. */
const ENTER = "starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-200 ease-[var(--ease-out)]";
const LABEL = "text-[12px] text-mute";
const HELP = "text-[12px] text-dim";
/** The quiet links under a step: add a message, send another track. */
const QUIET_LINK = "inline-flex min-h-11 items-center text-[13px] text-mute underline-offset-4 hover:text-bone hover:underline";
/** Every missing answer says the same thing under its field (option 48); the one-of-two profile rule keeps its own sentence. */
const NEEDED = "Needed to send";

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
  receiverFirstName,
  termsHash,
  receiverAsksPlay = false,
  folderLink,
  retention,
}: {
  /** On the public link: the deletion promise ("Files that aren't kept are deleted within N days."), shown above Send. */
  retention?: string;
  /** On the public link, when the receiver takes folders: the "Send a folder" link shown under Choose a track. */
  folderLink?: React.ReactNode;
  handle: string;
  receiverName: string;
  genres: string[];
  /** Sending from a signed-in FloorTest account: name and email come from the account. */
  account?: { name: string; email: string };
  /** Hash of the Terms in force when the page was drawn, sent with the tick so the record proves which text was shown. */
  termsHash?: string;
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
  /** The receiver's first name, for "in Max's range" and "as Max listens" (falls back to the first word of their name). */
  receiverFirstName?: string;
  /** The receiver is a label or A&R desk: the sender picks Evaluation only or OK to play. Everyone else is DJ-style (no choice). */
  receiverAsksPlay?: boolean;
}) {
  const { items, phase, error, setError, sender, setSender, remembered, artFailed, add, remove, edit, send, reset: resetUpload, cancel, startedAt } = useTrackUpload(handle, { asAccount: !!account });
  const [drag, setDrag] = useState(false);
  // The sender's own pick wins; until they make one, a genre tapped in the brief fills the field.
  const [chosenGenre, setGenre] = useState<string | null>(null);
  const genre = chosenGenre ?? presetGenre;
  const [mix, setMix] = useState("");
  const [release, setRelease] = useState("");
  const [ai, setAi] = useState("");
  const [play, setPlay] = useState("evaluation");
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
  // The Terms tick: needed until this browser's confirmed email shows the current Terms already accepted.
  const [terms, setTerms] = useState<{ needed: boolean; updated: string | null; hash: string | null }>({ needed: true, updated: null, hash: null });
  const [termsTicked, setTermsTicked] = useState(false);
  const termsWaiting = !account && terms.needed && !termsTicked;
  // A remembered sender whose email this browser already confirmed: ask whether the current Terms are accepted. The
  // server answers only for that confirmed email. A refused send (the Terms changed meanwhile) asks again.
  const termsRefused = !!error && /accept the Terms/.test(error);
  const rememberedEmail = !account && remembered ? normalEmail(sender.email) : "";
  useEffect(() => {
    if (!rememberedEmail) return;
    const ctl = new AbortController();
    fetch(`/api/sender-code?email=${encodeURIComponent(rememberedEmail)}`, { signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(8000)]) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { confirmed?: boolean; termsNeeded?: boolean; termsUpdated?: boolean; termsVersion?: string; termsHash?: string } | null) => {
        if (!d?.confirmed || d.termsNeeded === undefined) return;
        setTerms({ needed: d.termsNeeded, updated: d.termsNeeded && d.termsUpdated ? (d.termsVersion ?? null) : null, hash: d.termsHash ?? null });
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [rememberedEmail, termsRefused]);
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
          const kept = recallSender(stored(SENDER_KEY));
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

  // On the public link a file dropped anywhere on the page is taken (the artwork field keeps its own drop), while
  // tracks can still be added: not during the code, the upload or the sent step. In the desk's Send card only the
  // card takes a drop (dropProps below).
  const takesDrop = !account && phase === "idle" && !waiting;
  useEffect(() => {
    if (!takesDrop) return;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files") && !(e.target instanceof HTMLInputElement);
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDrag(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDrag(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDrag(false);
      add(e.dataTransfer!.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [takesDrop, add]);

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
    setPlay("evaluation");
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
      if (!it.tags.title.trim()) need(`title-${it.id}`, "title", NEEDED);
      if (!it.tags.artist.trim()) need(`artist-${it.id}`, "artist", NEEDED);
    }
    if (!account) {
      if (!String(fd.get("name") ?? "").trim()) need("sender-name", "name", NEEDED);
      const email = String(fd.get("email") ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) need("sender-email", "email", NEEDED);
      if (!String(fd.get("sender_instagram") ?? "").trim() && !String(fd.get("sender_streaming") ?? "").trim())
        need("sender-instagram", "a profile", `Add your Instagram or a streaming profile so ${receiverName} knows who you are.`);
    }
    if (!genre) need("genre", "genre", NEEDED);
    if (!mix) need("mix_status", "mix", NEEDED);
    if (!release) need("release_status", "release", NEEDED);
    if (!ai) need("ai_use", "AI use", NEEDED);
    if (!found.length) return true;
    // A remembered sender line hides the fields; open them if one of them is the problem.
    if (found.some((i) => i.key.startsWith("sender-"))) setChangeYou(true);
    setIssues(found);
    requestAnimationFrame(() => goTo(found[0].key));
    return false;
  }

  /**
   * Sends the hash of the Terms this page showed (Safety, 15 Nov): a stale page never records text it didn't show; the
   * server refuses it (409) and the form asks again. Only without one does it use the hash from the email check.
   */
  function sendWithTerms(fd: FormData, t: TermsState) {
    if (t.termsNeeded && !termsHash && t.termsHash) fd.set("terms_hash", t.termsHash);
    return send(fd);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setIssues([]);
    if (!complete(fd)) return;
    if (account) return send(fd);
    const email = normalEmail(String(fd.get("email") ?? ""));
    setChecking(true);
    const r = await startEmailCheck(email, String(fd.get("cf-turnstile-response") ?? ""));
    setChecking(false);
    if (typeof r === "object") return sendWithTerms(fd, r.ready);
    if (r === "code") return setWaiting({ email, fd });
    setError(r);
  }

  const sentTitle = many ? `${items.length} tracks` : `“${items[0]?.tags.title}”`;
  // Held: stored and waiting for the next virus-check batch while the scanner sleeps (src/lib/held-uploads.ts).
  const heldCount = items.filter((it) => it.held).length;
  const allHeld = heldCount > 0 && heldCount === items.length;
  const firstToken = items.find((it) => it.token)?.token;
  // Inside the desk's Send card (signed in) each part is a ruled section; on the public link they're one plain column.
  const box = account ? "flex flex-col border-t border-dashed border-line-2 pt-3" : "flex flex-col";
  const first = receiverFirstName || receiverName.split(/\s+/)[0];

  /* ── Sent: what happened, what happens next, and the one link that matters. ── */
  if (showDone && (firstToken || heldCount > 0)) {
    const sentTo = maskEmail(account?.email ?? sender.email);
    return (
      // Centred in the space under the slim bar on the public page (option 48); in the desk's Send card it sits clear of the heading.
      <section
        ref={doneRef}
        role="status"
        data-picked
        className={`flex scroll-mt-16 flex-col items-center gap-3 text-center ${account ? "mt-2 border-t border-dashed border-line-2 px-2 pb-4 pt-6" : "my-auto py-6"} ${ENTER}`}
      >
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-lime text-ink">
          <svg viewBox="0 0 16 16" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* The tick draws itself once (300ms ease-out, after 100ms). Reduced motion: it's simply there. */}
            <path d="M3 8.5l3.2 3L13 4.5" pathLength={1} strokeDasharray={1} className="[stroke-dashoffset:0] transition-[stroke-dashoffset] delay-100 duration-300 ease-[var(--ease-out)] starting:[stroke-dashoffset:1] motion-reduce:transition-none" />
          </svg>
        </span>
        <h2 className="text-balance text-[20px] font-semibold leading-tight tracking-[-0.02em] text-bone">
          {allHeld ? `${sentTitle} ${many ? "are" : "is"} received.` : many ? `${items.length} tracks sent to ${receiverName}` : `Sent to ${receiverName}`}
        </h2>
        {allHeld ? (
          <p className="max-w-[400px] text-[13px] leading-5 text-mute">
            We&apos;re checking {many ? "them" : "it"} for viruses, which can take up to 20 minutes. {many ? "They reach" : "It reaches"} {receiverName}&apos;s desk as soon as {many ? "they pass" : "it passes"}, and we&apos;ll email {many ? "receipts" : "a receipt"} to <span className="text-bone">{account?.email ?? sender.email}</span>. Nothing else to do.
          </p>
        ) : (
          <p className="max-w-[400px] text-[13px] leading-5 text-mute">
            {many ? "Your receipts are on their way to" : "Your receipt is on its way to"} <span className="text-bone">{sentTo}</span>. {many ? "They update" : "It updates"} as {first} listens.
            {heldCount > 0 && ` ${heldCount} ${heldCount === 1 ? "is" : "are"} still being checked for viruses (up to 20 minutes); ${heldCount === 1 ? "its receipt follows" : "their receipts follow"} by email.`}
          </p>
        )}
        <ul className="flex w-full flex-col gap-2" aria-label={many ? "Receipts" : undefined}>
          {items.map((it) => (
            <li key={it.id}>
              <FileRow
                title={it.tags.title || it.file.name}
                meta={`${fileKind(it)}${it.analysis ? ` · ${fmtTime(it.analysis.duration)}` : ""}${it.held ? " · being checked" : ""}`}
                right={
                  many && it.token ? (
                    <Link href={`/receipt/${it.token}`} aria-label={`Receipt for “${it.tags.title || it.file.name}”`} className="inline-flex min-h-11 shrink-0 items-center text-[13px] text-bone underline underline-offset-4">
                      Receipt
                    </Link>
                  ) : (
                    !it.held && <Icon name="check" className="size-5 shrink-0 text-bone" />
                  )
                }
              />
            </li>
          ))}
        </ul>
        {/* The four steps a sender hears about; Delivered is lit once it's on the desk. */}
        <ol aria-label="What happens next" className="flex w-full flex-col text-left text-[14px]">
          {(["Delivered", "Listened", "Downloaded", "Replied"] as const).map((step, i) => {
            const lit = i === 0 && !allHeld;
            return (
              <li key={step} className={`flex min-h-10 items-center gap-3 ${lit ? "text-bone" : "text-dim"}`}>
                <span aria-hidden className={`size-3 shrink-0 rounded-full border-2 ${lit ? "border-lime bg-(--color-lime)" : "border-line-2"}`} />
                <span className="min-w-0">
                  <span className="font-semibold">{step}</span>
                  {lit && (
                    <>
                      {" "}
                      · to {receiverName}&apos;s desk{callout ? ` for ${callout}` : ""} · now<span className="sr-only"> (done)</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        {artFailed && (
          <p className="text-[13px] text-mute">
            {heldCount > 0 ? "Artwork can't be added while a track is being checked, so it goes without it." : <>The artwork didn&apos;t upload. {many ? "The tracks were" : "The track was"} sent without it.</>}
          </p>
        )}
        {!many && firstToken && (
          <Link href={`/receipt/${firstToken}`} className="btn-lime min-h-12 w-full rounded-full text-[15px] font-bold">
            Open your receipt
          </Link>
        )}
        <button type="button" onClick={reset} className={`${QUIET_LINK} underline`}>
          Send another track
        </button>
      </section>
    );
  }

  // The desk's Send card takes drops itself; on the public link the whole page does (the effect above).
  const dropProps = account && {
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
      <section aria-label="Your track" className={`${box} gap-2.5`}>
        <div
          {...dropProps}
          className={`flex flex-col items-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed px-4 py-5 text-center transition-colors duration-150 ${drag ? "border-bone bg-well" : "border-line-2"}`}
        >
          {fileInput}
          <Icon name="up" className="size-6 text-mute" />
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-lime min-h-12 rounded-full px-6 text-[15px] font-bold">
            Choose a track
          </button>
          <p className={`${HELP} text-mute`}>
            or drop it here · WAV or MP3 · up to 250 MB · up to {MAX_FILES} tracks
          </p>
          {folderLink}
        </div>
        {restored && <p className="text-[13px] text-mute">Pick your files again: your details are still here.</p>}
        {errorBox}
      </section>
    );
  }
  /* ── Step 2: confirm what we read from the file, then the essentials. ── */
  const row = (it: Item, i: number) => {
    const bpm = it.tags.bpm ?? it.analysis?.bpm;
    const inside = !!bpmRange && !!bpm && Math.round(bpm) >= bpmRange[0] && Math.round(bpm) <= bpmRange[1];
    const name = it.tags.title || it.file.name;
    return (
      <li key={it.id} id={`track-${it.id}`} className={`flex flex-col gap-2.5 ${ENTER}`}>
        <FileRow
          title={name}
          meta={
            <>
              {many && `${i + 1} of ${items.length} · `}
              {fileKind(it)} · {it.analysis ? fmtTime(it.analysis.duration) : fmtBytes(it.file.size)}
              {bpm && " · "}
              {bpm && (
                <span className={inside ? "font-semibold text-lime" : undefined}>
                  {inside && <Icon name="check" className="-mt-0.5 mr-0.5 inline size-3.5" />}
                  {Math.round(bpm)} BPM{inside && `, in ${first}’s range`}
                </span>
              )}
            </>
          }
          right={
            it.status === "done" ? (
              <span className="shrink-0 text-[12px] text-bone">Sent</span>
            ) : (
              !busy && (
                <button type="button" onClick={() => remove(it.id)} className="-my-1 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-xl text-mute hover:text-bone" aria-label={`Remove ${name}`}>
                  <Icon name="x" className="size-[18px]" />
                </button>
              )
            )
          }
        />
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block min-w-0 space-y-1" htmlFor={`title-${it.id}`}>
            <span className={LABEL}>Title<Req /></span>
            <input id={`title-${it.id}`} className={`input w-full ${invalid(`title-${it.id}`)}`} required value={it.tags.title} disabled={it.status === "done"} aria-invalid={isInvalid(`title-${it.id}`)} aria-describedby={described(`title-${it.id}`)} onChange={(e) => (clear(`title-${it.id}`), edit(it.id, { title: e.target.value }))} />
            {problem(`title-${it.id}`)}
          </label>
          <label className="block min-w-0 space-y-1" htmlFor={`artist-${it.id}`}>
            <span className={LABEL}>Artist<Req /></span>
            <input id={`artist-${it.id}`} className={`input w-full ${invalid(`artist-${it.id}`)}`} required value={it.tags.artist} disabled={it.status === "done"} aria-invalid={isInvalid(`artist-${it.id}`)} aria-describedby={described(`artist-${it.id}`)} onChange={(e) => (clear(`artist-${it.id}`), edit(it.id, { artist: e.target.value }))} />
            {problem(`artist-${it.id}`)}
          </label>
        </div>
        {many && it.error && <p className="text-[12px] text-danger">{it.error}</p>}
      </li>
    );
  };
  // The centred steps (code, sending) sit in the middle of the space under the slim bar on the public page.
  const centred = account ? "" : "my-auto py-6";
  return (
    <>
      {transferring && (
        <TransferScreen
          className={centred}
          receiverName={receiverName}
          handle={handle}
          callout={callout}
          startedAt={startedAt}
          onCancel={holding ? () => {} : cancel}
          retry={items.find((it) => it.retry)?.retry}
          checking={items.some((it) => it.checking)}
          files={items.map((it) => ({ name: it.tags.title || it.file.name, size: it.file.size, progress: it.progress, state: it.status === "done" ? "sent" : it.status === "uploading" ? "sending" : it.status === "error" ? "failed" : "waiting" }))}
        />
      )}
      {waiting && (
        <EmailCode
          email={waiting.email}
          receiverName={receiverName}
          sending={items.map((it) => it.tags.title || it.file.name)}
          onConfirmed={(t) => {
            const fd = waiting.fd;
            setWaiting(null);
            sendWithTerms(fd, t);
          }}
          onCancel={() => setWaiting(null)}
        />
      )}
      {/* The one place screen readers hear upload progress: milestones only (which track, each quarter, each track sent). */}
      <p role="status" className="sr-only">
        {busy ? uploadMilestone(items) : ""}
      </p>
      {/* One column, in the order a sender answers (option 48): the track, who's sending, about it, extras, Terms, Send. */}
      <form onSubmit={submit} noValidate data-picked className={waiting || transferring ? "hidden" : "flex flex-col gap-3.5"} onChange={() => (touched.current = true)} onClick={() => (touched.current = true)} {...dropProps}>
        {fileInput}
        <section aria-label={many ? `The tracks (${items.length})` : "The track"} className={`${box} gap-2.5`}>
          <ol className="flex flex-col gap-3.5">{items.map(row)}</ol>
          {items.length < MAX_FILES && (
            <button type="button" onClick={() => inputRef.current?.click()} className={`${QUIET_LINK} -my-1.5 w-fit`}>
              + Add another track ({MAX_FILES - items.length} more)
            </button>
          )}
        </section>
        {account ? (
          // Who's sending is said above the Send button (option 58 A); the form still carries it.
          <>
            <input type="hidden" name="name" value={account.name} />
            <input type="hidden" name="email" value={account.email} />
          </>
        ) : remembered && !changeYou ? (
          <section aria-label="You" className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-1 text-[13px] text-mute">
            <p className="min-w-0 truncate">
              Sending as <span className="font-semibold text-bone">{sender.name}</span> · {maskEmail(sender.email)}
            </p>
            <button type="button" onClick={() => setChangeYou(true)} className="inline-flex min-h-11 shrink-0 items-center px-1 text-bone underline underline-offset-4">
              Change
            </button>
            <input type="hidden" name="name" value={sender.name} />
            <input type="hidden" name="email" value={sender.email} />
            <input type="hidden" name="sender_instagram" value={sender.instagram} />
            <input type="hidden" name="sender_streaming" value={sender.streaming} />
          </section>
        ) : (
          <section aria-label="You" className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block min-w-0 space-y-1" htmlFor="sender-name">
                <span className={LABEL}>Your name<Req /></span>
                <input id="sender-name" className={`input w-full ${invalid("sender-name")}`} name="name" required autoComplete="name" value={sender.name} aria-invalid={isInvalid("sender-name")} aria-describedby={described("sender-name")} onChange={(e) => (clear("sender-name"), setSender((s) => ({ ...s, name: e.target.value })))} />
                {problem("sender-name")}
              </label>
              <label className="block min-w-0 space-y-1" htmlFor="sender-email">
                <span className={LABEL}>Your email<Req /></span>
                <input id="sender-email" className={`input w-full ${invalid("sender-email")}`} name="email" type="email" required autoComplete="email" placeholder="you@example.com" value={sender.email} aria-invalid={isInvalid("sender-email")} aria-describedby={described("sender-email", "sender-email-help")} onChange={(e) => (clear("sender-email"), setSender((s) => ({ ...s, email: e.target.value })))} />
                {problem("sender-email")}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block min-w-0 space-y-1" htmlFor="sender-instagram">
                <span className={LABEL}>Instagram</span>
                <input id="sender-instagram" className={`input w-full ${invalid("sender-instagram")}`} name="sender_instagram" autoComplete="off" maxLength={2000} placeholder="@yourname" value={sender.instagram} aria-invalid={isInvalid("sender-instagram")} aria-describedby={described("sender-instagram", "profiles-help")} onChange={(e) => (clear("sender-instagram"), setSender((s) => ({ ...s, instagram: e.target.value })))} />
              </label>
              <label className="block min-w-0 space-y-1" htmlFor="sender-streaming">
                <span className={LABEL}>Streaming profile</span>
                <input id="sender-streaming" className={`input w-full ${invalid("sender-instagram")}`} name="sender_streaming" inputMode="url" autoComplete="url" maxLength={2000} placeholder="open.spotify.com/artist/…" value={sender.streaming} aria-invalid={isInvalid("sender-instagram")} aria-describedby={described("sender-instagram", "profiles-help")} onChange={(e) => (clear("sender-instagram"), setSender((s) => ({ ...s, streaming: e.target.value })))} />
              </label>
            </div>
            {problem("sender-instagram")}
            {/* One helper line: what the email is for, and why one profile. */}
            <p className={`-mt-0.5 ${HELP}`}>
              {!issueFor("sender-email") && <span id="sender-email-help">For your receipt and updates only. Never shown to anyone. </span>}
              {!issueFor("sender-instagram") && <span id="profiles-help">One of these, so {receiverName} knows who you are.</span>}
            </p>
          </section>
        )}
        <section aria-label={many ? "About these tracks" : "About it"} className={`${box} gap-3.5`}>
          <GenrePicker id="genre" genres={genres} value={genre} onChange={(g) => (clear("genre"), setGenre(g))} inputClass="input" labelClass={LABEL} invalid={!!issueFor("genre")} issue={problem("genre")} />
          <input type="hidden" name="genre" value={genre} />
          <Choice id="mix_status" name="mix_status" label="Mix" value={mix} onChange={(v) => (clear("mix_status"), setMix(v))} issue={problem("mix_status")} options={MIX_CHOICES} />
          <Choice id="release_status" name="release_status" label="Release" value={release} onChange={(v) => (clear("release_status"), setRelease(v))} issue={problem("release_status")} options={RELEASE_CHOICES} />
          <Choice id="ai_use" name="ai_use" label="AI use" value={ai} onChange={(v) => (clear("ai_use"), setAi(v))} issue={problem("ai_use")} options={AI_CHOICES} help={AI_HELP} />
          {receiverAsksPlay && (
            <Choice id="play" name="play" label="Sending to a label" value={play} onChange={setPlay} options={PLAY_CHOICES} help={playHelp(play, receiverName)} disabled={busy} />
          )}
          {/* Optional extras stay out of the way until asked for. */}
          {(!messageOpen || (trackArt && !artOpen)) && (
            <div className="-my-1.5 flex flex-wrap gap-x-4">
              {!messageOpen && (
                <button type="button" onClick={() => setMessageOpen(true)} className={QUIET_LINK}>
                  + Add a message
                </button>
              )}
              {trackArt && !artOpen && (
                <button type="button" onClick={() => setArtOpen(true)} className={QUIET_LINK}>
                  + Add artwork
                </button>
              )}
            </div>
          )}
          {messageOpen && (
            <label className={`block space-y-1 ${ENTER}`} htmlFor="message">
              <span className={LABEL}>Message for {receiverName}</span>
              <textarea id="message" className="input min-h-24 w-full resize-y" name="message" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus placeholder="What it is, where it fits, anything they should know. Travels privately with the track." />
            </label>
          )}
          {trackArt && artOpen && (
            <label className={`block space-y-1 ${ENTER}`} htmlFor="artwork">
              <span className={LABEL}>Artwork</span>
              <input id="artwork" type="file" name="artwork" accept="image/jpeg,image/png,image/webp" disabled={busy} className="input w-full file:mr-3 file:rounded file:border-0 file:bg-ink-3 file:px-3 file:py-1 file:text-bone" />
              <span className={`block ${HELP}`}>JPG, PNG or WebP, up to 25 MB. Sent at full quality. {many ? "Goes with every track in this send." : ""}</span>
            </label>
          )}
        </section>
        {errorBox}
        {!account && <Turnstile action="send" siteKey={botCheckKey} />}
        <div className="flex flex-col gap-3">
          {/* Senders without an account tick the Terms on a first send and after the Terms change (Research brief, owner 15 Nov). */}
          {!account && terms.needed && <TermsTick checked={termsTicked} onChange={setTermsTicked} updated={terms.updated} hash={termsHash ?? terms.hash ?? null} />}
          {/* On phones Send stays pinned at the bottom of the screen while the form scrolls; from tablet up it ends the column. */}
          <div data-send-bar className="flex flex-col gap-1.5 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-3.5 max-sm:border-t max-sm:border-line max-sm:bg-ink/95 max-sm:px-3.5 max-sm:pt-2.5 max-sm:pb-[max(12px,env(safe-area-inset-bottom))] max-sm:backdrop-blur-sm">
            {issues.length > 0 && (
              <p role="alert" className={`text-center text-[13px] text-danger ${ENTER}`}>
                {issues.length === 1 ? "1 thing left: " : `${issues.length} things left: `}
                {issues.map((it, i) => (
                  <span key={it.key}>
                    {i > 0 && ", "}
                    <button type="button" onClick={() => goTo(it.key)} className="relative underline underline-offset-4 before:absolute before:-inset-x-1 before:-inset-y-3">
                      {it.short}
                    </button>
                  </span>
                ))}
              </p>
            )}
            {account && (
              <p className="text-center text-[12px] text-mute">
                Sent from your account, {account.name}. Only {receiverName}’s desk hears it.
              </p>
            )}
            {!account && (
              <p className="text-center text-[12px] text-mute">
                Only {receiverName}’s desk hears it. You get a receipt.{retention && ` ${retention}`}
              </p>
            )}
            <button className="btn-lime min-h-12 w-full rounded-full text-[15px] font-bold" disabled={busy || analyzing || checking || termsWaiting} aria-describedby={termsWaiting ? "terms-wait" : undefined}>
              {checking ? "Checking your email…" : analyzing ? "Reading audio…" : many ? `Send ${items.length} tracks to ${receiverName}` : `Send to ${receiverName}`}
            </button>
            {termsWaiting && (
              <p id="terms-wait" className="text-center text-[12px] text-mute">
                Tick the box above to send.
              </p>
            )}
          </div>
          <p className="text-[12px] leading-[18px] text-dim">
            By sending you confirm you own or control {many ? "these tracks" : "this track"}, your answer about AI is accurate, and you&apos;re 18 or over. {receiverName} may listen to it and download it to evaluate it.{receiverAsksPlay ? " They can play it out only if you pick OK to play above, and" : " They"} can&apos;t release it anywhere without a signed agreement with you.
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

const fileKind = (it: Item) => (/\.wav$/i.test(it.file.name) ? "WAV" : "MP3");

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
