"use client";

import { useToast } from "@/components/Toast";
import { useShortcutsOn } from "@/components/useShortcuts";

/**
 * Keyboard shortcuts on or off for this browser (WCAG 2.1.4). Off, the Queue's letter and number keys (K, X, R, U, J,
 * 1–4) do nothing; Space and the arrow keys still play and move. Saved on this device, the same in every open tab.
 */
export function ShortcutsSwitch() {
  const [on, setOn] = useShortcutsOn();
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Keyboard shortcuts</p>
        <p className="text-sm text-mute">
          In the Queue: K keep, X not for me, R reply, U undo, J next, 1–4 jump. Space and the arrow keys always work. Saved in this browser.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Keyboard shortcuts"
        onClick={() => {
          setOn(!on);
          toast.show({ message: `Keyboard shortcuts ${on ? "off" : "on"} in this browser` });
        }}
        className={`relative h-7 w-12 shrink-0 rounded-full transition before:absolute before:-inset-2 before:content-[''] ${on ? "bg-lime" : "bg-line"}`}
      >
        <span className={`switch-thumb absolute left-1 top-1 h-5 w-5 rounded-full bg-ink ${on ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}
