"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { fmtBytes } from "@/lib/format";
import { clearShared, sharedFiles, type SharedFile } from "@/lib/native-share";
import { SubmitForm } from "../../[handle]/SubmitForm";
import { FolderSend } from "./FolderSend";
import { SendModeTabs } from "../../[handle]/SendModes";
import { CuePoint } from "@/components/CuePoint";
import { ProfileLinks } from "@/components/ProfileLinks";
import { lookupReceiver, type ReceiverLookup } from "../actions/desk";
import { CARD, Cover, initials } from "@/components/Kit";
import { LatestSends, SentToBefore, type LatestSend, type SentBefore } from "./SendLists";

type Found = Extract<ReceiverLookup, { found: true }>;

/** "Open until 30 Nov" from the brief becomes "closes 30 Nov" in the header lines. */
function closesLine(f: Found) {
  const d = f.brief.find((b) => b.k === "Deadline")?.v;
  return d?.startsWith("Open until ") ? `closes ${d.slice("Open until ".length)}` : null;
}
/** "Receiving for Night set · closes 30 Nov", or whichever half there is. */
function receivingLine(f: Found) {
  return [f.collection && `Receiving for ${f.collection}`, closesLine(f)].filter(Boolean).join(" · ");
}

function Avatar({ f, size }: { f: Found; size: number }) {
  return f.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={f.photo} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-[12px] object-cover" />
  ) : (
    <Cover text={initials(f.name)} size={size >= 44 ? "size-11" : "size-9"} />
  );
}

/**
 * Send music (option 58 A): who it's for first (the field, then who it is), then the link page's own form. Beside it on a
 * laptop, under it on a phone until a person shows, the people you've sent to before and your latest sends.
 */
export function SendComposer({ host, account, initial, before, latest, total }: {
  host: string; account: { name: string; email: string }; initial: string; before: SentBefore[]; latest: LatestSend[]; total: number;
}) {
  const [handle, setHandle] = useState(initial);
  // A ?to= link goes straight to the form once its lookup says yes; otherwise the form waits for "Add tracks".
  const [step, setStep] = useState<"pick" | "form">(initial ? "form" : "pick");
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  // The lookup's answer, kept with the link name it was for: a newer name shows nothing until its own answer arrives.
  const [lookup, setLookup] = useState<{ handle: string; found: ReceiverLookup } | null>(null);
  const found = lookup && lookup.handle === handle.trim() ? lookup.found : null;
  const person = found?.found ? found : null;
  const [pending, start] = useTransition();
  // In the app: files shared in from another app, waiting to be sent.
  const [shared, setShared] = useState<SharedFile[]>([]);
  const [sharedReady, setSharedReady] = useState<File[] | undefined>(undefined);
  const field = useRef<HTMLInputElement | null>(null);
  const focusField = useRef(false);
  const slim = useRef<HTMLDivElement | null>(null);
  const focusSlim = useRef(false);

  useEffect(() => {
    sharedFiles().then((list) => {
      if (!list.length) return;
      setShared(list);
      setSharedReady(list.map((s) => s.file));
      setMode("tracks");
    });
  }, []);
  const dropShared = useCallback(() => {
    clearShared(shared.map((s) => s.id));
    setShared([]);
    setSharedReady(undefined);
  }, [shared]);

  useEffect(() => {
    const h = handle.trim();
    if (!h) return;
    const t = setTimeout(() => start(async () => setLookup({ handle: h, found: await lookupReceiver(h) })), 300);
    return () => clearTimeout(t);
  }, [handle]);

  // "Change" puts the field back, empty, with the cursor in it.
  // "Add tracks" hands focus to who it's going to, so keyboard and screen-reader users land on the form, not the page top.
  useEffect(() => {
    if (step === "pick" && focusField.current) {
      focusField.current = false;
      field.current?.focus();
    }
    if (step === "form" && focusSlim.current) {
      focusSlim.current = false;
      slim.current?.focus();
    }
  }, [step]);

  // Return looks the name up now rather than after the pause.
  const go = (e: FormEvent) => {
    e.preventDefault();
    const h = handle.trim();
    if (h && !found) start(async () => setLookup({ handle: h, found: await lookupReceiver(h) }));
  };
  const pick = (h: string) => {
    setHandle(h);
    setStep("pick");
  };
  const change = () => {
    focusField.current = true;
    setHandle("");
    setStep("pick");
  };

  const sending = step === "form" && person?.accepting ? person : null;
  const invalid = !pending && found && !found.found && !!found.reason;

  return (
    <div className="mx-auto grid w-full max-w-[1040px] min-w-0 gap-6 min-[1180px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)] min-[1180px]:items-start min-[1180px]:gap-7">
      <div className="flex min-w-0 flex-col gap-4">
        {shared.length > 0 && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-[14px] border border-lime/40 bg-lime/5 px-3.5 py-3 text-[13px]">
            <span className="min-w-0">
              <span className="block font-semibold text-bone">Shared to FloorTest</span>
              {shared.map((s) => (
                <span key={s.id} className="block truncate text-[11.5px] text-mute">
                  {s.file.name} · {fmtBytes(s.file.size)}
                </span>
              ))}
              <span className="mt-1 block text-[11.5px] text-mute">{sending ? "It's in the form below." : "Who's it for? Add their link name."}</span>
            </span>
            <button type="button" onClick={dropShared} className="inline-flex min-h-11 shrink-0 items-center rounded-[11px] border border-line bg-well px-3 text-[12.5px] font-semibold text-bone hover:bg-ink-4">
              Remove
            </button>
          </div>
        )}

        {sending ? (
          <>
            <h1 className="sr-only">Send music to {sending.name}</h1>
            {/* Who it's going to, slim, with the way back to the field. */}
            <div ref={slim} tabIndex={-1} className="flex min-w-0 items-center gap-3 outline-none">
              <Avatar f={sending} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold text-bone">{sending.name}</span>
                  {sending.verified && <CuePoint size={16} label="Verified by FloorTest: this account controls the linked profile" />}
                </p>
                {receivingLine(sending) && <p className="truncate text-[11.5px] text-mute">{receivingLine(sending).replace(/^Receiving for /, "")}</p>}
              </div>
              <button type="button" onClick={change} className="inline-flex min-h-11 shrink-0 items-center rounded-[11px] px-2.5 text-[13px] font-semibold text-mute underline-offset-4 hover:text-bone hover:underline">
                Change
              </button>
            </div>
            <section key={sending.handle} aria-label={`Your track for ${sending.name}`} className="flex min-w-0 flex-col gap-3">
              {sending.folderBytes > 0 && <SendModeTabs mode={mode} setMode={setMode} />}
              {sending.folderBytes > 0 && mode === "folder" ? (
                <FolderSend handle={sending.handle} receiverName={sending.name} genres={sending.genres} folderBytes={sending.folderBytes} account={account} trackArt={sending.trackArt} receiverAsksPlay={sending.asksPlay} />
              ) : (
                <SubmitForm handle={sending.handle} receiverName={sending.name} genres={sending.genres} account={account} trackArt={sending.trackArt} receiverAsksPlay={sending.asksPlay} initialFiles={sharedReady} onSent={shared.length ? dropShared : undefined} />
              )}
            </section>
          </>
        ) : (
          <>
            <header className="flex flex-col gap-1 px-0.5">
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-bone">Send music</h1>
              <p className="text-[13px] leading-5 text-mute">Send a track to anyone with a FloorTest link. You get a receipt for each one.</p>
            </header>

            <form onSubmit={go} noValidate className="flex flex-col gap-1.5">
              <label htmlFor="send-to" className="px-1 text-[13px] font-semibold text-bone">
                Who&apos;s it for?
              </label>
              <div className="flex min-h-12 items-center rounded-[14px] border border-line bg-card px-3.5 focus-within:border-lime/70">
                <span className="max-w-[60%] shrink-0 truncate font-mono text-[14px] text-faint">{host}/</span>
                <input
                  id="send-to"
                  ref={field}
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value.toLowerCase().replace(/^.*\//, "").replace(/[^a-z0-9-_]/g, ""));
                    setStep("pick");
                  }}
                  placeholder="link-name"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-invalid={invalid || undefined}
                  aria-describedby="send-to-status"
                  // The field's box carries the focus ring (globals.css), so the bare input inside draws none.
                  style={{ outline: "none" }}
                  className="min-w-0 flex-1 bg-transparent py-2 font-mono text-base text-lime outline-none placeholder:text-faint"
                />
              </div>
              <div id="send-to-status" className="min-h-5 px-1 text-[12px]" aria-live="polite">
                {pending && <span className="text-mute">Looking…</span>}
                {invalid && (
                  <span role="alert" className="text-danger">
                    {found.reason}
                  </span>
                )}
              </div>
            </form>

            {person && (
              <section
                key={person.handle}
                aria-label={`Send music to ${person.name}`}
                className={`${CARD} flex min-w-0 flex-col gap-3 p-3.5 starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-200 ease-[var(--ease-out)]`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar f={person} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] text-mute">Send music to</p>
                    <p className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold text-bone">{person.name}</span>
                      {/* FloorTest's own verified mark, the Cue Point tick (owner, 30 Oct: not a text chip). */}
                      {person.verified && <CuePoint size={16} label="Verified by FloorTest: this account controls the linked profile" />}
                    </p>
                    {person.accepting && receivingLine(person) ? (
                      <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-mute">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />
                        <span className="truncate">{receivingLine(person)}</span>
                      </p>
                    ) : (
                      person.roleLine && <p className="truncate text-[11.5px] text-mute">{person.roleLine}</p>
                    )}
                  </div>
                </div>
                {person.links.length > 0 && <ProfileLinks links={person.links} size={18} />}
                {person.accepting ? (
                  <>
                    {person.brief.some((b) => b.k !== "Deadline") && (
                      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                        <p className="text-[12px] font-semibold text-bone">What {person.name} is looking for</p>
                        <dl className="flex flex-col gap-1 text-[12.5px]">
                          {person.brief
                            .filter((b) => b.k !== "Deadline")
                            .map((b) => (
                              <div key={b.k} className="flex gap-2">
                                <dt className="w-16 shrink-0 text-mute">{b.k}</dt>
                                <dd className="min-w-0 text-bone">{b.v}</dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                    )}
                    {/* On phones the button stays above the player and menu (globals.css [data-send-bar]). */}
                    <div data-send-bar className="max-md:sticky max-md:bottom-0 max-md:z-10 min-[1180px]:self-start">
                      <button type="button" onClick={() => {
                          focusSlim.current = true;
                          setStep("form");
                        }} className="btn-lime min-h-12 w-full rounded-full px-6 text-[15px] font-bold min-[1180px]:w-auto">
                        Add tracks for {person.name}
                      </button>
                    </div>
                  </>
                ) : (
                  // Paused, closed or full: their words, no form and no button.
                  <div role="status" className="flex flex-col gap-2 border-t border-line pt-3 text-[13px]">
                    <p className="font-semibold text-bone">{person.reason}</p>
                    {person.note && <p className="whitespace-pre-wrap border-l-2 border-lime pl-3 text-mute">{person.note}</p>}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Both lists: always beside the form on a laptop; on a phone they step out while a person is shown. */}
      <aside aria-label="Your sends" className={`flex min-w-0 flex-col gap-6 ${person ? "max-[1179px]:hidden" : ""}`}>
        <SentToBefore people={before} onPick={pick} />
        <LatestSends sends={latest} total={total} />
      </aside>
    </div>
  );
}
