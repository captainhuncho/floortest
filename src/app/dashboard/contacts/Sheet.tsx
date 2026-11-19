"use client";

import { useId, useRef } from "react";
import { useModalDialog } from "@/components/Dialog";

/** How far the grabber must be pulled down before letting go closes the sheet. */
const SWIPE_CLOSE_PX = 60;

/**
 * The Contacts pages' short sheets (sort, More). The app's own modal shell (Dialog.tsx, globals.css "Dialogs"): a
 * bottom sheet on phones above the player and menu pair, a small centred box from 640px. Escape, a tap on the dimmed
 * page or a swipe down on the grabber closes it, and focus goes back to the button that opened it. Reduced motion:
 * it appears without sliding (globals.css).
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { ref, modalProps } = useModalDialog(open, onClose);
  const titleId = useId();
  const start = useRef<number | null>(null);

  // A downward drag that starts on the grabber or the title only, so it never fights scrolling inside the sheet.
  const drag = {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = e.clientY;
      // Keep the drag's moves and release on the grabber even when the pointer leaves it (a mouse or trackpad drag).
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current === null || !ref.current) return;
      const dy = Math.max(0, e.clientY - start.current);
      ref.current.style.transform = dy ? `translateY(${dy}px)` : "";
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (start.current === null) return;
      const dy = e.clientY - start.current;
      start.current = null;
      if (ref.current) ref.current.style.transform = "";
      if (dy > SWIPE_CLOSE_PX) onClose();
    },
    onPointerCancel: () => {
      start.current = null;
      if (ref.current) ref.current.style.transform = "";
    },
  };

  return (
    <dialog aria-labelledby={titleId} className="ft-dialog" {...modalProps}>
      <div className="ft-dialog-panel pt-2!">
        <div {...drag} className="flex touch-none flex-col items-center gap-2 pb-1">
          <span aria-hidden className="h-[5px] w-9 rounded-full bg-line-2 sm:hidden" />
          <h2 id={titleId} className="w-full text-[13px] font-semibold text-mute sm:pt-2">
            {title}
          </h2>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** A 52px row in a sheet: a link or a button, a hairline between rows. */
export const SHEET_ROW =
  "flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-line text-left text-base last:border-b-0 sm:text-[14px]";
