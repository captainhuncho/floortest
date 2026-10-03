"use client";

import { useActionState } from "react";
import { addTeammate, removeTeammate } from "../actions";

/** Owner's side of a shared collection: who can listen and vote, and adding or removing them. */
export function Teammates({ collectionId, members, max }: { collectionId: number; members: { id: number; name: string; handle: string }[]; max: number }) {
  const [error, add, pending] = useActionState(addTeammate.bind(null, collectionId), null);
  return (
    <section aria-labelledby="team-h" className="rounded-xl border border-line bg-ink-3 p-3.5 md:px-4">
      <h2 id="team-h" className="text-[11px] font-bold uppercase text-faint">
        Teammates
      </h2>
      <p className="mt-1 text-[12px] text-mute">Teammates can listen to every track here and vote keep or pass with a note. Only you decide, reply or download. Senders see who hears their track.</p>
      {members.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
              <span className="min-w-0 truncate">
                {m.name} <span className="text-faint">@{m.handle}</span>
              </span>
              <form action={removeTeammate.bind(null, collectionId, m.id)}>
                <button className="text-[11px] font-bold text-mute hover:text-danger">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {members.length < max && (
        <form action={add} className="mt-3 flex gap-2">
          <input name="who" required aria-label="Teammate's link name or email" placeholder="Link name or email" className="input min-w-0 flex-1 text-[12px]" />
          <button disabled={pending} className="btn-ghost btn-sm shrink-0">
            Add
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
