"use client";

import { useEffect, useRef, useState } from "react";
import { dragHasFiles, entriesOf, readDrop, type Dropped } from "@/lib/dropped-files";

/**
 * Files or folders dropped anywhere on the page, while `enabled`. Returns whether files are being dragged over it, so the
 * page can show where they'll land. Links or text dragged around the page are left alone. A drop is a laptop or desktop
 * extra: every page that uses this keeps its own button and file picker (phones can't drag files).
 */
export function usePageDrop(enabled: boolean, onDrop: (d: Dropped) => void, onFail: () => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef({ onDrop, onFail });
  useEffect(() => {
    handler.current = { onDrop, onFail };
  });
  useEffect(() => {
    if (!enabled) return;
    const over = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    // relatedTarget is null only when the drag leaves the window, not when it moves between elements.
    const leave = (e: DragEvent) => !e.relatedTarget && setDragging(false);
    const drop = async (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      // A folder the browser can't read (permissions, a file moved mid-read) says so instead of failing silently.
      try {
        handler.current.onDrop(await readDrop(entriesOf(e.dataTransfer!)));
      } catch {
        handler.current.onFail();
      }
    };
    const end = () => setDragging(false);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", end);
    };
  }, [enabled]);
  // Turned off mid-drag (an upload started): no outline, without a state change inside the effect.
  return enabled && dragging;
}

/** The outline shown over the page while files are dragged over it. Purely visual: it never takes the pointer. */
export function DropOutline({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-2 z-40 flex items-center justify-center rounded-[18px] border-2 border-dashed border-lime bg-ink/70">
      <p className="rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-bone">{label}</p>
    </div>
  );
}
