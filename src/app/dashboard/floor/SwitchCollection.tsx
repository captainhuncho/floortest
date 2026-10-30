"use client";

import { useTransition } from "react";
import { setActiveCollection } from "../actions/collections";
import { LIME_SM } from "../kitButtons";

export function SwitchCollection({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className={LIME_SM} disabled={pending} onClick={() => start(() => setActiveCollection(id))}>
      {pending ? "Switching…" : `Send new tracks to ${name}`}
    </button>
  );
}
