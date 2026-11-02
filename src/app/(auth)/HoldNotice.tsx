"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** "1:45", or "23 h 59 min" / "24 h" for the long holds (whole minutes, rounded up, so never "23 h 60 min"). */
function left(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const m = Math.ceil(s / 60);
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/**
 * The countdown while password tries from this device are paused (lib/login-limits holds; owner, 2 Nov). Ticks once a
 * second; `onDone` lets the form enable its button again. The timer is role="timer" (not announced every second; the
 * alert above already says what happened), and the last, 24-hour step offers "Report this", which goes to the Support inbox.
 */
export function HoldNotice({ left: leftMs, final, onDone }: { left: number; final?: boolean; onDone: () => void }) {
  // Counted from when this answer arrived, on this device's own clock (the form remounts it for each answer).
  const [until] = useState(() => Date.now() + leftMs);
  const [now, setNow] = useState(() => Date.now());
  const remaining = until - now;
  useEffect(() => {
    if (remaining <= 0) return onDone();
    const t = setTimeout(() => setNow(Date.now()), Math.min(1000, remaining));
    return () => clearTimeout(t);
  }, [now, remaining, onDone]);
  if (remaining <= 0) return null;
  return (
    <div className="af-note">
      <p>
        Try again in <span role="timer" className="tnum font-semibold text-bone">{left(remaining)}</span>
      </p>
      {/* The short holds already sit under "Forgot your password?" and the email-code link; the 24-hour one adds "Report this". */}
      {final && (
        <p className="af-links mt-2">
          <Link href="/contact?locked=1" className="af-lnk">
            Report this
          </Link>
        </p>
      )}
    </div>
  );
}
