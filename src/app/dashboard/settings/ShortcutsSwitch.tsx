"use client";

import { useToast } from "@/components/Toast";
import { useShortcutsOn } from "@/components/useShortcuts";
import { SettingLine, Switch } from "./ui";

/**
 * Keyboard shortcuts on or off for this browser (WCAG 2.1.4). Off, the Queue's letter and number keys (K, X, R, U, J,
 * 1–4) do nothing; Space and the arrow keys still play and move. Saved on this device, the same in every open tab.
 */
export function ShortcutsSwitch() {
  const [on, setOn] = useShortcutsOn();
  const toast = useToast();
  return (
    <SettingLine title="Keyboard shortcuts" sub="In the Review Queue: K keep, X not for me, R reply, U undo, J next, 1–4 jump. Space and the arrow keys always work.">
      <Switch
        on={on}
        label="Keyboard shortcuts"
        onClick={() => {
          setOn(!on);
          toast.show({ message: `Keyboard shortcuts ${on ? "off" : "on"} in this browser` });
        }}
      />
    </SettingLine>
  );
}
