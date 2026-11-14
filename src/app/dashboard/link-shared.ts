"use client";

import { markLinkShared } from "./actions/desk";

let sent = false;

/**
 * Getting started's "Share your link" step: called after a copy or share of the link or a share card. Once per page
 * load, in the background; a failure only means the step ticks off next time.
 */
export function linkShared() {
  if (sent) return;
  sent = true;
  markLinkShared().catch(() => {
    sent = false;
  });
}
