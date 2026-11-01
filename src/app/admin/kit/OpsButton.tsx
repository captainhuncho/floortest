"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { announceOps, type OpsResult } from "@/lib/ops-result";
import { DONE_HOLD_MS, SPINNER_DELAY_MS } from "./core";
import { announce as say } from "./live";

type Phase = "idle" | "working" | "done";

/**
 * The ops kit's action button (admin redesign B). A press answers at once (it scales to .97 with no delay); a spinner
 * shows only if the server takes longer than 150 ms; then "✓" and the result in the same space, or the reason under it
 * with Retry. A second press while it works does nothing. The result is said once: by the toast (the default, because
 * the row often leaves the list), or, with `announce={false}`, in place only.
 *
 * `action` is a server action returning OpsResult, usually bound: `action={setFeedbackStatus.bind(null, id, "fixed")}`.
 * It may resolve to null to back out quietly (a confirm that was cancelled).
 */
export function OpsButton({
  action,
  children,
  done,
  announce = true,
  onDone,
  className = "",
  ref,
  ...rest
}: {
  action: () => Promise<OpsResult | null>;
  children: React.ReactNode;
  /** What the button says once it worked; the result's message when left out. */
  done?: React.ReactNode;
  announce?: boolean;
  /** Runs after a success, e.g. to clear a selection. */
  onDone?: (r: OpsResult) => void;
  className?: string;
  /** The button itself, e.g. for a shortcut key to press it. */
  ref?: React.Ref<HTMLButtonElement>;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children" | "className">) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [doneText, setDoneText] = useState<React.ReactNode>(null);
  const [width, setWidth] = useState<number | null>(null);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const btn = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => btn.current as HTMLButtonElement, []);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const run = () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    // Keep the button's size while the label gives way to the spinner or the tick, so nothing around it moves.
    setWidth(btn.current?.offsetWidth ?? null);
    const spin = window.setTimeout(() => setPhase("working"), SPINNER_DELAY_MS);
    timers.current.push(spin);
    const finish = () => {
      clearTimeout(spin);
      busy.current = false;
      setPhase("idle");
      setWidth(null);
    };
    // Not inside a transition: the action may open a confirm first, and a transition would hold that back until the
    // whole action ended. Next still applies the server's refreshed page when the action answers.
    void (async () => {
      let r: OpsResult | null;
      try {
        r = await action();
      } catch (e) {
        // A redirect or not-found from the server is Next's own signal (the router follows it), not a failure.
        if (typeof e === "object" && e && "digest" in e && /^NEXT_/.test(String((e as { digest: unknown }).digest))) return finish();
        r = { ok: false, error: "That didn't go through, so nothing changed. Check your connection." };
      }
      clearTimeout(spin);
      if (!r) return finish();
      if (!r.ok) {
        finish();
        setError(r.error);
        return;
      }
      setDoneText(done ?? r.message);
      // The size lock ends with the answer: the refreshed page may have changed the label (a ✓ on the chosen status).
      setWidth(null);
      setPhase("done");
      if (announce) announceOps(r);
      else say(r.message);
      onDone?.(r);
      timers.current.push(window.setTimeout(finish, DONE_HOLD_MS));
    })();
  };

  return (
    <span className="kit-opsbtn">
      <button
        {...rest}
        ref={btn}
        type="button"
        onClick={(e) => {
          // The second click of a double-click never runs it again.
          if (e.detail > 1) return;
          run();
        }}
        aria-busy={phase !== "idle" || undefined}
        aria-disabled={phase !== "idle" || undefined}
        data-phase={phase}
        style={width ? { width } : undefined}
        className={`kit-press relative ${className}`}
      >
        <span className="kit-btn-label">{children}</span>
        <span className="kit-btn-state" aria-hidden>
          {phase === "working" ? <span className="kit-spin" /> : phase === "done" ? <span className="truncate">✓ {doneText}</span> : null}
        </span>
      </button>
      {error && (
        <span role="alert" className="kit-btn-error">
          <span>{error}</span>
          <button
            type="button"
            className="kit-retry"
            onClick={() => {
              btn.current?.focus();
              run();
            }}
          >
            Retry
          </button>
        </span>
      )}
    </span>
  );
}
