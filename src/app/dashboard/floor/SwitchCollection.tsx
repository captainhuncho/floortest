"use client";

import { useTransition } from "react";
import { setActiveCollection } from "../actions/collections";

export function SwitchCollection({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-lime btn-sm" disabled={pending} onClick={() => start(() => setActiveCollection(id))}>
      {pending ? "Switching…" : `Send tracks to ${name}`}
    </button>
  );
}
