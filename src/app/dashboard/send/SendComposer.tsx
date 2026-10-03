"use client";

import { CuePoint } from "@/components/CuePoint";
import { useEffect, useState, useTransition } from "react";
import { SubmitForm } from "../../[handle]/SubmitForm";
import { lookupReceiver, type ReceiverLookup } from "../actions";

/** Type someone's link name, see who they are, then send them a track from your account. */
export function SendComposer({ host, account, initial }: { host: string; account: { name: string; email: string }; initial: string }) {
  const [handle, setHandle] = useState(initial);
  const [found, setFound] = useState<ReceiverLookup | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = handle.trim();
    if (!h) return setFound(null);
    const t = setTimeout(() => start(async () => setFound(await lookupReceiver(h))), 300);
    return () => clearTimeout(t);
  }, [handle]);

  return (
    <div className="space-y-6">
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
          <p className="label">Send music to</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {found.name}
            {found.verified && <span className="chip ml-2 inline-flex items-center gap-1.5 align-middle border-lime/60 text-xs font-medium text-lime"><CuePoint size={16} /> Verified</span>}
          </p>
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
              <SubmitForm handle={found.handle} receiverName={found.name} genres={found.genres} account={account} />
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
