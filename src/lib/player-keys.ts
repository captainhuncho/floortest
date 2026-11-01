/**
 * The players' in-page keys, as plain functions so they can be tested without a browser.
 *
 * Desk (every dashboard page while a track is loaded): Space play/pause, ← / → 10 s, Shift+↑ / Shift+↓ volume, M mute.
 * The Review Queue and List already use ↑ / ↓ to move between tracks, so volume takes Shift there and everywhere on the
 * desk, to keep one rule. Shared collection page: Space, ← / →, ↑ / ↓ volume, M mute.
 *
 * Hardware volume keys are the device's, not the page's: a web page can't read or catch them. These keys change the
 * player's own volume, remembered on this device.
 */

export type PlayerKey = "toggle" | "back" | "forward" | "louder" | "quieter" | "mute";

export type KeyLike = { key: string; code?: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; target?: unknown };

/** Where keys belong to something else: fields, dialogs, menus, the ⌘K palette. */
const OWN_KEYS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], dialog';
/** Controls that use Space themselves. */
const SPACE_KEYS = "button, a, summary, [role=button], [role=slider], [role=switch], [role=checkbox], [role=tab], audio, video";
/** Controls that use the arrow keys themselves. */
const ARROW_KEYS = "[role=slider], [role=tab], [role=radio], [role=radiogroup], [role=tablist], audio, video";

type Closest = { closest(sel: string): unknown };
const within = (t: unknown, sel: string) => !!t && typeof (t as Closest).closest === "function" && !!(t as Closest).closest(sel);

/**
 * Which player action a key press means, or null when it isn't the player's (typing, a dialog, a modifier, a control
 * that uses the key). `volumeNeedsShift`: the desk, where plain ↑ / ↓ move between tracks.
 */
export function playerKey(e: KeyLike, o: { volumeNeedsShift: boolean }): PlayerKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (within(e.target, OWN_KEYS)) return null;
  const arrow = e.key.startsWith("Arrow");
  if (arrow && within(e.target, ARROW_KEYS)) return null;
  if (e.code === "Space" || e.key === " ") {
    if (e.shiftKey || within(e.target, SPACE_KEYS)) return null;
    return "toggle";
  }
  if (e.key === "ArrowLeft" && !e.shiftKey) return "back";
  if (e.key === "ArrowRight" && !e.shiftKey) return "forward";
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    if (!!e.shiftKey !== o.volumeNeedsShift) return null;
    return e.key === "ArrowUp" ? "louder" : "quieter";
  }
  if (e.key.toLowerCase() === "m" && !e.shiftKey) return "mute";
  return null;
}

export const VOLUME_STEP = 0.1;

/** Between 0 and 1, in whole percent (so ten steps down from 1 land on 0, not 1e-16). */
export const clampVolume = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 100) / 100)) : 1);

export const VOLUME_KEY = "ft:volume";
export const MUTED_KEY = "ft:muted";

/** The player volume saved on this device: 1 when none, or storage is blocked. */
export function savedVolume(): { volume: number; muted: boolean } {
  try {
    const v = localStorage.getItem(VOLUME_KEY);
    return { volume: v === null || v === "" ? 1 : clampVolume(Number(v)), muted: localStorage.getItem(MUTED_KEY) === "1" };
  } catch {
    return { volume: 1, muted: false };
  }
}

export function saveVolume(volume: number, muted: boolean) {
  try {
    localStorage.setItem(VOLUME_KEY, String(clampVolume(volume)));
    if (muted) localStorage.setItem(MUTED_KEY, "1");
    else localStorage.removeItem(MUTED_KEY);
  } catch {}
}

/** Words for the volume note and screen readers: "Volume 60%", "Muted". */
export const volumeWords = (volume: number, muted: boolean) => (muted || volume === 0 ? "Muted" : `Volume ${Math.round(volume * 100)}%`);
