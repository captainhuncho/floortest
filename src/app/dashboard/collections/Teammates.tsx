"use client";

import { useActionState } from "react";
import { addTeammate, removeTeammate, setTeamCanDecide } from "../actions/team";

/** Owner's side of a shared collection: who can listen and vote, and adding or removing them. */
export function Teammates({ collectionId, members, max, teamCanDecide }: { collectionId: number; members: { id: number; name: string; handle: string }[]; max: number; teamCanDecide: boolean }) {
  const [error, add, pending] = useActionState(addTeammate.bind(null, collectionId), null);
  return (
    <section aria-labelledby="team-h" className="card p-3.5 md:px-4">
      <h2 id="team-h" className="text-[11px] font-bold uppercase text-faint">
        Teammates
      </h2>
      <p className="mt-1 text-[12px] text-mute">
        Review Together lets invited teammates listen, vote, comment and shortlist{teamCanDecide ? ", and make the Keep / Not for me call" : ""}. New music must still be sent
        through your link: teammates can&apos;t upload. Only you reply or download. Senders see who hears their track.
      </p>
      <form action={setTeamCanDecide.bind(null, collectionId, !teamCanDecide)} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-[12px]">
        <span className="min-w-0">
          Teammates can Keep / Not for me <span className="text-faint">· {teamCanDecide ? "On" : "Off"}. Not for me starts the 30-day deletion.</span>
        </span>
        <button className="btn-ghost btn-sm shrink-0">{teamCanDecide ? "Turn off" : "Turn on"}</button>
      </form>
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
