"use client";

import { useRef, useState } from "react";
import { GateForm } from "./GateForm";
import { WaitlistPanel } from "./WaitlistDialog";

/**
 * The gate's one glass panel (desktop) or frosted sheet (phones). "Join the waitlist" swaps the password form for the
 * waitlist in the same place, no pop-up; on phones the waitlist is a plain full screen until "You're on the list"
 * brings the photo back (`cs-plain`, set by WaitlistPanel, in gate.css). Focus follows the swap both ways.
 */
export function GateSheet({ next, host, botCheckKey }: { next: string; host: string; botCheckKey: string | null }) {
  const [view, setView] = useState<"gate" | "waitlist">("gate");
  const joinRef = useRef<HTMLButtonElement>(null);
  const back = () => {
    setView("gate");
    requestAnimationFrame(() => joinRef.current?.focus());
  };
  return (
    <section aria-labelledby={view === "gate" ? "soon-h" : "wl-h"} className="cs-sheet">
      {view === "gate" ? (
        <>
          <p className="cs-eye">
            <span aria-hidden className="cs-dot" />
            Invite-only beta
          </p>
          <h1 id="soon-h" className="cs-h">
            Coming soon
          </h1>
          <p className="cs-line">If you&apos;ve been invited to look around, enter the password.</p>
          <GateForm next={next} />
          <button ref={joinRef} type="button" onClick={() => setView("waitlist")} className="af-btn aw-alt">
            Join the waitlist
          </button>
        </>
      ) : (
        <WaitlistPanel host={host} botCheckKey={botCheckKey} onBack={back} />
      )}
    </section>
  );
}
