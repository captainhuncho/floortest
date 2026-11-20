"use client";

import { useSyncExternalStore } from "react";
import { checkHandle } from "./waitlist/actions";

/**
 * The name typed into a home page claim box, and whether it's free. The page has two boxes (hero and end), a link card
 * and a phone bar that all show it, so it lives here rather than in one box's state: one name, one check per name
 * however many boxes are on the page. Nothing is stored: it lasts until the tab reloads or closes.
 */
export type ClaimStatus = Awaited<ReturnType<typeof checkHandle>>;
type Claim = { name: string; status: ClaimStatus | null };

const EMPTY: Claim = { name: "", status: null };
let claim = EMPTY;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const set = (next: Claim) => {
  claim = next;
  listeners.forEach((fn) => fn());
};

/** A newer name shows no answer until its own arrives; the check waits 400 ms for the typing to stop. */
export function setClaimName(name: string) {
  set({ name, status: null });
  clearTimeout(timer);
  if (name.length < 2) return;
  timer = setTimeout(async () => {
    try {
      const status = await checkHandle(name);
      if (claim.name === name) set({ name, status });
    } catch {
      // The check couldn't be reached: say nothing rather than guess. Claiming still works; sign-up checks again.
    }
  }, 400);
}

export const useClaim = () => useSyncExternalStore(subscribe, () => claim, () => EMPTY);
