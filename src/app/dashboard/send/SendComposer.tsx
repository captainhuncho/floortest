"use client";

import { CuePoint } from "@/components/CuePoint";
import { useCallback, useEffect, useState, useTransition } from "react";
import { fmtBytes } from "@/lib/format";
import { clearShared, sharedFiles, type SharedFile } from "@/lib/native-share";
import { SubmitForm } from "../../[handle]/SubmitForm";
import { FolderSend } from "./FolderSend";
import { SendModeTabs } from "../../[handle]/SendModes";
import { ProfileLinks } from "@/components/ProfileLinks";
import { lookupReceiver, type ReceiverLookup } from "../actions/desk";

/** Type someone's link name, see who they are, then send them a track from your account. */
export function SendComposer({ host, account, initial }: { host: string; account: { name: string; email: string }; initial: string }) {
  const [handle, setHandle] = useState(initial);
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  const [found, setFound] = useState<ReceiverLookup | null>(null);
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
    if (!h) return setFound(null);
    const t = setTimeout(() => start(async () => setFound(await lookupReceiver(h))), 300);
    return () => clearTimeout(t);
  }, [handle]);

  return (
    <div className="space-y-6">
      {shared.length > 0 && (
        <div role="status" className="flex items-start justify-between gap-4 rounded-lg border border-lime/40 bg-lime/5 px-4 py-3 text-sm">
          <span className="min-w-0">
            <span className="block font-medium">Shared to FloorTest</span>
            {shared.map((s) => (
              <span key={s.id} className="block truncate text-mute">
                {s.file.name} · {fmtBytes(s.file.size)}
              </span>
            ))}
            <span className="mt-1 block text-mute">{found?.found ? "It's in the form below." : "Who's it for? Add their link name."}</span>
          </span>
          <button type="button" onClick={dropShared} className="btn btn-sm btn-ghost shrink-0">
            Remove
          </button>
        </div>
      )}
      <div>
        <label htmlFor="send-to" className="label">
          Send to
        </label>
        <div className="mt-1.5 flex items-stretch overflow-hidden rounded-md border border-line bg-ink-2 focus-within:border-lime/70">
          <span className="flex items-center pl-3 font-mono text-sm text-mute">{host}/</span>
          <input
            id="send-to"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^.*\//, "").replace(/[^a-z0-9-_]/g, ""))}
            placeholder="their-link"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full bg-transparent py-2.5 pr-3 font-mono text-sm text-lime outline-none placeholder:text-dim"
          />
        </div>
        <div className="mt-2 min-h-6 text-sm" aria-live="polite">
          {pending && <span className="text-mute">Looking…</span>}
          {!pending && found && !found.found && found.reason && <span className="text-danger">{found.reason}</span>}
          {!pending && found?.found && (
            <span>
              <span className="font-medium">{found.name}</span>
              {found.verified && <span className="ml-1.5 inline-flex items-center gap-1 text-lime"><CuePoint size={16} /> Verified</span>}
              {found.roleLine && <span className="text-mute"> · {found.roleLine}</span>}
            </span>
          )}
        </div>
      </div>

      {found?.found && (
        <div key={found.handle} className="rounded-lg border border-line p-5">
          {found.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={found.photo} alt="" width={64} height={64} className="mb-3 size-16 rounded-xl object-cover" />
          )}
          <p className="label">Send music to</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {found.name}
            {found.verified && <span className="chip ml-2 inline-flex items-center gap-1.5 align-middle border-lime/60 text-xs font-medium text-lime"><CuePoint size={16} /> Verified</span>}
          </p>
          {found.links.length > 0 && <ProfileLinks links={found.links} className="mt-3" />}
          {found.accepting && found.collection && (
            <p className="mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-lime/40 bg-lime/5 px-3 py-1 text-sm">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-lime" />
              Receiving for <span className="font-medium text-lime">{found.collection}</span>
            </p>
          )}
          {found.accepting && found.brief.length > 0 && (
            <dl className="mt-4 grid gap-x-6 gap-y-2 border-y border-line py-3 text-sm sm:grid-cols-2">
              {found.brief.map((b) => (
                <div key={b.k}>
                  <dt className="label">{b.k}</dt>
                  <dd className="mt-0.5">{b.v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-5">
            {found.accepting ? (
              <>
                {found.folderBytes > 0 && (
                  <SendModeTabs mode={mode} setMode={setMode} className="mb-4" />
                )}
                {found.folderBytes > 0 && mode === "folder" ? (
                  <FolderSend handle={found.handle} receiverName={found.name} genres={found.genres} folderBytes={found.folderBytes} account={account} trackArt={found.trackArt} />
                ) : (
                  <SubmitForm handle={found.handle} receiverName={found.name} genres={found.genres} account={account} trackArt={found.trackArt} initialFiles={sharedReady} onSent={shared.length ? dropShared : undefined} />
                )}
              </>
            ) : (
              <div role="status">
                <p className="font-medium">{found.reason}</p>
                {found.note && <p className="mt-3 whitespace-pre-wrap border-l-2 border-lime pl-3">{found.note}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
