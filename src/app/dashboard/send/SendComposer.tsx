"use client";

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
              {found.verified && <span className="ml-1.5 text-lime">✓ Verified</span>}
              {found.roleLine && <span className="text-mute"> · {found.roleLine}</span>}
              {!found.accepting && <span className="ml-2 text-danger">{found.reason}</span>}
            </span>
          )}
        </div>
      </div>

      {found?.found && found.accepting && (
        <div key={found.handle} className="rounded-lg border border-line p-5">
          <SubmitForm handle={found.handle} receiverName={found.name} genres={found.genres} account={account} />
        </div>
      )}
    </div>
  );
}
