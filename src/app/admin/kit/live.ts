/**
 * One polite live region for the whole ops area (ops kit): a result a control shows only visually (a ✓ on a button,
 * "3 selected") is read out here, once. Toasts have their own status role and don't use it.
 */
let region: HTMLDivElement | null = null;

export function announce(text: string) {
  if (typeof document === "undefined") return;
  if (!region || !region.isConnected) {
    region = document.createElement("div");
    region.className = "sr-only";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.dataset.kitLive = "";
    document.body.append(region);
  }
  const r = region;
  r.textContent = "";
  // Cleared first and set in the next frame, so the same words twice are still read twice.
  requestAnimationFrame(() => (r.textContent = text));
}

/** True while a dialog, sheet or the ⌘K palette is open: single-key shortcuts stay off then. */
export const isDialogOpen = () => typeof document !== "undefined" && !!document.querySelector("dialog[open], [role='dialog'][aria-modal='true']:not([hidden])");

/** True when a key press comes from somewhere you type. */
export const isField = (el: EventTarget | null) =>
  el instanceof Element && !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
