"use client";

import { useTransition } from "react";
import { setActiveCollection } from "../actions/collections";
import { QUIET } from "./Crates";

/** In the closed-collection notice: points the link at a collection that is open. Quiet: lime is for Review and Mark what I played. */
export function SwitchCollection({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className={QUIET} disabled={pending} onClick={() => start(() => setActiveCollection(id))}>
      {pending ? "Switching…" : `Send new tracks to ${name}`}
    </button>
  );
}
