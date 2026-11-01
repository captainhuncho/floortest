"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog, DIALOG_QUIET } from "@/components/Dialog";
import { keyName, matchShortcut, shortcutAllowed } from "./core";
import { isDialogOpen, isField } from "./live";

export type Shortcut = { label: string; run: () => unknown };
type Registry = { set(owner: string, map: Record<string, Shortcut> | null): void; help(): void };

const KeysContext = createContext<Registry | null>(null);
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The one key manager for ops (ops kit). Screens add their single-key shortcuts with useShortcuts; this listens once.
 * Keys are off while you type in a field, while a dialog or the ⌘K palette is open, and with ⌘/Ctrl/Alt held. A key
 * pressed while an earlier shortcut's action is still running waits its turn, so fast typing never drops or reorders
 * work. "?" lists every shortcut on the current screen.
 */
export function KeysProvider({ children }: { children: React.ReactNode }) {
  const maps = useRef(new Map<string, Record<string, Shortcut>>());
  const [helpOpen, setHelpOpen] = useState(false);
  const [listed, setListed] = useState<[string, string][]>([]);
  const queue = useRef<Shortcut[]>([]);
  const running = useRef(false);
  const pending = useRef({ seq: "", at: 0 });

  const registry = useMemo<Registry>(
    () => ({
      set(owner, map) {
        if (map) maps.current.set(owner, map);
        else maps.current.delete(owner);
      },
      help() {
        const mac = isMac();
        const own = [...maps.current.values()].flatMap((m) => Object.entries(m).map(([k, s]) => [k, s.label] as [string, string]));
        setListed([["?", "Show this list"], [mac ? "⌘ K" : "Ctrl K", "Search people, pages and actions"], [mac ? "⌘ Z" : "Ctrl Z", "Undo the last action"], ...own]);
        setHelpOpen(true);
      },
    }),
    [],
  );

  useEffect(() => {
    async function drain() {
      if (running.current) return;
      running.current = true;
      while (queue.current.length) {
        const next = queue.current.shift()!;
        try {
          await next.run();
        } catch {
          // The action shows its own error.
        }
      }
      running.current = false;
    }
    const onKey = (e: KeyboardEvent) => {
      if (!shortcutAllowed({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, inField: isField(e.target) || (e.target as HTMLElement)?.isContentEditable, dialogOpen: isDialogOpen(), defaultPrevented: e.defaultPrevented })) return;
      if (e.key === "?") {
        e.preventDefault();
        registry.help();
        return;
      }
      const all: Record<string, Shortcut> = Object.assign({}, ...maps.current.values());
      const key = keyName(e.key, e.shiftKey);
      const m = matchShortcut(Object.keys(all), key, pending.current.seq, Date.now() - pending.current.at);
      pending.current = { seq: m.pending, at: Date.now() };
      if (m.pending) return e.preventDefault();
      if (!m.run) return;
      e.preventDefault();
      queue.current.push(all[m.run]);
      void drain();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [registry]);

  return (
    <KeysContext.Provider value={registry}>
      {children}
      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Keyboard shortcuts"
        description="Single keys are off while you type in a field or a dialog is open."
        actions={
          <button type="button" data-autofocus className={DIALOG_QUIET} onClick={() => setHelpOpen(false)}>
            Close
          </button>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {listed.map(([k, l]) => (
            <div key={k} className="contents">
              <dt className="whitespace-nowrap">
                {k.split(" ").map((p, i) => (
                  <kbd key={i} className="kit-kbd mr-1">
                    {p}
                  </kbd>
                ))}
              </dt>
              <dd>{l}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </KeysContext.Provider>
  );
}

/** Adds a screen's shortcuts while it is mounted: `useShortcuts({ j: { label: "Next row", run } })`. */
export function useShortcuts(map: Record<string, Shortcut>) {
  const reg = useContext(KeysContext);
  const owner = useId();
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  });
  useEffect(() => {
    if (!reg) return;
    // The registered entries call through to the latest handlers, so a re-render never needs to re-register.
    const stable = Object.fromEntries(Object.entries(latest.current).map(([k, s]) => [k, { label: s.label, run: () => latest.current[k]?.run() }]));
    reg.set(owner, stable);
    return () => reg.set(owner, null);
  }, [reg, owner]);
}

/** Opens the "?" list from elsewhere (the ⌘K action "Keyboard shortcuts"). */
export function useKeysHelp() {
  const reg = useContext(KeysContext);
  return () => reg?.help();
}
