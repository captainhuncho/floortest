"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { askToShare } from "../actions";

/** Ask the artist, per track, to allow sharing it with a non-commercial partner. */
export function ShareRequest({ trackId, status }: { trackId: number; status: { state: "pending" | "allowed" | "declined" | "cancelled" | "shareable" | null; at: string | null } }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState(status.state);
  const [pending, start] = useTransition();
  const toast = useToast();

  if (state === "shareable") return <span className="chip border-lime/50 text-lime">Artist allowed sharing</span>;
  // An Allow can still be cancelled by the artist until `at`; sharing starts after that.
  if (state === "allowed") return <span className="chip border-lime/30 text-mute">Artist allowed · final {status.at}</span>;
  if (state === "pending") return <span className="chip border-line text-mute">Asked to share{status.at ? ` · ${status.at}` : ""}</span>;

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-mute underline-offset-4 hover:text-bone hover:underline">
        {state === "declined" ? "Artist declined sharing · ask again" : state === "cancelled" ? "Artist cancelled sharing · ask again" : "Request to share"}
      </button>
    );
  return (
    <form
      className="mt-1 flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const ok = await askToShare(trackId, note);
          if (ok) {
            setState("pending");
            toast.show({ message: "Request sent. The artist decides." });
          } else toast.show({ message: "Couldn't send that request." });
        });
      }}
    >
      <label className="text-[10px] text-faint" htmlFor={`share-note-${trackId}`}>
        Who is it for? (optional, the artist sees this)
      </label>
      <input
        id={`share-note-${trackId}`}
        value={note}
        maxLength={280}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. a DJ friend playing in Accra"
        className="input py-1.5 text-[11px]"
      />
      <p className="text-[10px] text-faint">For playing in sets and promotion only, never commercial release.</p>
      <div className="flex gap-2">
        <button disabled={pending} className="btn-lime btn-sm">
          {pending ? "Sending…" : "Send request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-sm text-mute">
          Cancel
        </button>
      </div>
    </form>
  );
}
