"use client";

import { useEffect, useState } from "react";
import { clearOffline, offlineAvailable, offlineStatus, onOfflineProgress, syncOffline, type OfflineStatus } from "@/lib/native-offline";
import { CARD, IconBox } from "@/components/Kit";
import { useBrowserValue } from "@/components/useBrowserValue";
import { GHOST_BTN } from "./buttons";

/**
 * Phone apps only: keep the kept tracks on this phone to play with no connection (the offline screen becomes a player).
 * Once on, opening Prepare brings the phone's copy in line: new keeps are saved, cleared or deleted tracks leave the phone.
 */
export function OfflineSave({ count, className = "" }: { count: number; className?: string }) {
  // Only inside the phone apps.
  const shown = useBrowserValue(offlineAvailable, false);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const on = status?.owner !== undefined && status.owner !== null;

  useEffect(() => {
    if (!offlineAvailable()) return;
    const stop = onOfflineProgress((p) => {
      setProgress(p.finished ? null : { done: p.done, total: p.total });
      if (p.finished) void offlineStatus().then(setStatus);
    });
    void offlineStatus().then((s) => {
      setStatus(s);
      // Already saving for offline: bring the phone's copy in line with Prepare now.
      if (s?.owner !== undefined && s.owner !== null) void syncOffline();
    });
    return stop;
  }, []);

  if (!shown) return null;

  async function turnOn() {
    setError("");
    if (!(await syncOffline())) return setError("Couldn't start saving. Check your connection and try again.");
    setProgress({ done: 0, total: count });
  }

  async function turnOff() {
    await clearOffline();
    setProgress(null);
    setStatus(await offlineStatus());
  }

  return (
    <section aria-labelledby="offline-h" className={`${CARD} flex flex-col gap-2 p-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconBox name="lock" small />
          <h2 id="offline-h" className="text-[13px] font-semibold text-bone">
            Save for offline
          </h2>
        </div>
        {on || progress ? (
          <button type="button" onClick={turnOff} className={`${GHOST_BTN} w-auto! shrink-0 px-3!`}>
            Remove from phone
          </button>
        ) : (
          <button type="button" onClick={turnOn} disabled={!count} className="btn-lime min-h-10 shrink-0 rounded-[11px] px-3! pointer-coarse:min-h-11">
            Save on this phone
          </button>
        )}
      </div>
      <p className="text-[11.5px] leading-[1.45] text-mute" aria-live="polite">
        {progress
          ? `Saving… ${progress.done} of ${progress.total}`
          : on
            ? `${status!.count} ${status!.count === 1 ? "track" : "tracks"} on this phone. Play them with no connection; they update when you open Prepare.`
            : "Keep your kept tracks on this phone to play with no signal, like in the booth. Removed when you sign out."}
      </p>
      {error && <p className="text-[11.5px] text-danger">{error}</p>}
    </section>
  );
}
