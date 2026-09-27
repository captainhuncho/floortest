"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { playedOut } from "./actions";

/** For kept tracks: tell the sender it was played in a set. The best signal FloorTest sends. */
export function PlayedOut({ trackId, senderName, at, note }: { trackId: number; senderName: string; at: number | null; note: string }) {
  const [done, setDone] = useState(at ? note || "done" : null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  if (done)
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="chip border-lime/60 text-lime">Played out</span>
        <span className="text-mute">{done !== "done" ? done : `${senderName} was told`}</span>
      </p>
    );
  if (!open)
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        🎛️ Played it out
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (await playedOut(trackId, text)) {
            setDone(text.trim() || "done");
            toast.show({ message: `${senderName} will hear their track was played out` });
          }
        });
      }}
    >
      <input
        className="input max-w-64 py-2"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={140}
        placeholder="Where or when (optional)"
        aria-label="Where or when you played it"
        autoFocus
      />
      <button className="btn-lime btn-sm" disabled={pending}>
        Tell {senderName}
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
