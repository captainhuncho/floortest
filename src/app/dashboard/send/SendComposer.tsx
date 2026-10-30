"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { fmtBytes } from "@/lib/format";
import { clearShared, sharedFiles, type SharedFile } from "@/lib/native-share";
import { SubmitForm } from "../../[handle]/SubmitForm";
import { FolderSend } from "./FolderSend";
import { SendModeTabs } from "../../[handle]/SendModes";
import { ProfileLinks } from "@/components/ProfileLinks";
import { lookupReceiver, type ReceiverLookup } from "../actions/desk";
import { CARD, Chip, Cover, Icon, IconBox, InfoRow, SectionHead, initials } from "@/components/Kit";

/** Type someone's link name, see who they are, then send them a track from your account. */
export function SendComposer({ host, account, initial }: { host: string; account: { name: string; email: string }; initial: string }) {
  const [handle, setHandle] = useState(initial);
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  // The lookup's answer, kept with the link name it was for: a newer name shows nothing until its own answer arrives.
  const [lookup, setLookup] = useState<{ handle: string; found: ReceiverLookup } | null>(null);
  const found = lookup && lookup.handle === handle.trim() ? lookup.found : null;
  const [pending, start] = useTransition();
  // In the app: files shared in from another app, waiting to be sent.
  const [shared, setShared] = useState<SharedFile[]>([]);
  const [sharedReady, setSharedReady] = useState<File[] | undefined>(undefined);

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

  // Continue (or Return): look the name up now rather than after the pause, then bring their send form into view.
  const target = useRef<HTMLDivElement | null>(null);
  const wantReveal = useRef(false);
  const reveal = (el: HTMLElement | null) =>
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  // The form block mounts when the answer arrives; if Continue asked for it, it scrolls itself into view.
  const formRef = (el: HTMLDivElement | null) => {
    target.current = el;
    if (el && wantReveal.current) {
      wantReveal.current = false;
      reveal(el);
    }
  };
  const go = (e: FormEvent) => {
    e.preventDefault();
    const h = handle.trim();
    if (!h) return;
    if (found) {
      if (found.found) reveal(target.current);
      return;
    }
    wantReveal.current = true;
    start(async () => setLookup({ handle: h, found: await lookupReceiver(h) }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      {shared.length > 0 && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-[14px] border border-lime/40 bg-lime/5 px-3.5 py-3 text-[13px]">
          <span className="min-w-0">
            <span className="block font-semibold text-bone">Shared to FloorTest</span>
            {shared.map((s) => (
              <span key={s.id} className="block truncate text-[11.5px] text-mute">
                {s.file.name} · {fmtBytes(s.file.size)}
              </span>
            ))}
            <span className="mt-1 block text-[11.5px] text-mute">{found?.found ? "It's in the form below." : "Who's it for? Add their link name."}</span>
          </span>
          <button type="button" onClick={dropShared} className="inline-flex min-h-10 shrink-0 items-center rounded-[11px] border border-line bg-well px-3 text-[12.5px] font-semibold text-bone hover:bg-ink-4">
            Remove
          </button>
        </div>
      )}

      <section aria-labelledby="send-to-h" className={`${CARD} flex min-w-0 flex-col gap-2.5 p-3`}>
        <form onSubmit={go} noValidate className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <IconBox name="link" small />
            {/* The section title is the field's label, so the field reads "Send to" without a second label. */}
            <h2 id="send-to-h" className="text-[15px] font-semibold tracking-[-0.015em] text-bone">
              <label htmlFor="send-to">Send to</label>
            </h2>
          </div>
          {/* The link field with its one action inside it. Continue is the page's light until their send form opens,
              which brings its own lime Send button; from then on Continue steps back to a ghost. */}
          <div className="flex items-center gap-1 rounded-[13px] border border-line bg-well py-1 pr-1 focus-within:border-lime/70">
            <span className="max-w-[55%] shrink-0 truncate pl-3 font-mono text-base text-faint md:text-[13px]">{host}/</span>
            <input
              id="send-to"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^.*\//, "").replace(/[^a-z0-9-_]/g, ""))}
              placeholder="their-link"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              // The field's box carries the focus ring (globals.css), so the bare input inside draws none.
              style={{ outline: "none" }}
              className="min-w-0 flex-1 bg-transparent py-1.5 pr-2 font-mono text-base text-lime outline-none placeholder:text-faint md:text-[13px]"
            />
            <button
              type="submit"
              disabled={!handle.trim()}
              className={`inline-flex min-h-10 shrink-0 items-center rounded-[11px] px-3.5 text-[12.5px] font-semibold disabled:opacity-50 ${found?.found ? "border border-line bg-card text-bone hover:bg-ink-4" : "bg-lime text-ink"}`}
            >
              Continue
            </button>
          </div>
          <div className="min-h-5 text-[12px]" aria-live="polite">
            {pending && <span className="text-mute">Looking…</span>}
            {!pending && found && !found.found && found.reason && <span className="text-danger">{found.reason}</span>}
            {!pending && found?.found && (
              // Who it is shows just below; this line says it to screen readers as the answer arrives.
              <span className="sr-only">
                {found.name}
                {found.verified && ", Verified"}
                {found.roleLine && ` · ${found.roleLine}`}
              </span>
            )}
          </div>
        </form>

        {found?.found && (
          <div key={found.handle} ref={formRef} className="flex scroll-mt-24 flex-col gap-2.5 border-t border-dashed border-line-2 pt-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {found.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={found.photo} alt="" width={38} height={38} className="size-[38px] shrink-0 rounded-[10px] object-cover" />
              ) : (
                <Cover text={initials(found.name)} />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="sr-only">Send music to </span>
                  <span className="truncate text-[13px] font-semibold text-bone">{found.name}</span>
                  {found.verified && (
                    <Chip tone="acc">
                      <Icon name="check" className="size-3" />
                      Verified
                    </Chip>
                  )}
                </p>
                {found.roleLine && <p className="truncate text-[11.5px] text-mute">{found.roleLine}</p>}
              </div>
            </div>
            {found.links.length > 0 && <ProfileLinks links={found.links} size={18} />}
            {found.accepting && (found.collection || found.brief.length > 0) && (
              <dl className="flex flex-col gap-1.5">
                {found.collection && (
                  <InfoRow icon="folder" label="Receiving for">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />
                      {found.collection}
                    </span>
                  </InfoRow>
                )}
                {found.brief.map((b) => (
                  <InfoRow key={b.k} icon={/format|quality/i.test(b.k) ? "wave" : "tag"} label={b.k}>
                    {b.v}
                  </InfoRow>
                ))}
              </dl>
            )}
            {!found.accepting && (
              <div role="status" className="rounded-[13px] border border-line bg-well p-3 text-[13px]">
                <p className="font-semibold text-bone">{found.reason}</p>
                {found.note && <p className="mt-2 whitespace-pre-wrap border-l-2 border-lime pl-3 text-mute">{found.note}</p>}
              </div>
            )}
          </div>
        )}
      </section>

      {found?.found && found.accepting && (
        // The send form itself (shared with the public link page), on its own card under who it's for.
        <section key={found.handle} aria-labelledby="send-tracks-h" className={`${CARD} flex min-w-0 flex-col gap-3 p-3`}>
          <SectionHead id="send-tracks-h" icon="music" title="Tracks" />
          {found.folderBytes > 0 && <SendModeTabs mode={mode} setMode={setMode} />}
          {found.folderBytes > 0 && mode === "folder" ? (
            <FolderSend handle={found.handle} receiverName={found.name} genres={found.genres} folderBytes={found.folderBytes} account={account} trackArt={found.trackArt} />
          ) : (
            <SubmitForm handle={found.handle} receiverName={found.name} genres={found.genres} account={account} trackArt={found.trackArt} initialFiles={sharedReady} onSent={shared.length ? dropShared : undefined} />
          )}
        </section>
      )}
    </div>
  );
}
