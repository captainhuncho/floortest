"use client";

import { useEffect, useState } from "react";
import { clearOffline, offlineAvailable, offlineStatus, onOfflineProgress, syncOffline, type OfflineStatus } from "@/lib/native-offline";

/**
 * Phone apps only: keep the kept tracks on this phone to play with no connection (the offline screen becomes a player).
 * Once on, opening Prepare brings the phone's copy in line: new keeps are saved, cleared or deleted tracks leave the phone.
 */
export function OfflineSave({ count }: { count: number }) {
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const on = status?.owner !== undefined && status.owner !== null;

  useEffect(() => {
    if (!offlineAvailable()) return;
    setShown(true);
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
    <div className="mt-3 rounded-xl border border-line bg-ink-3 p-4 text-xs md:mt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold text-bone">Save for offline</p>
          <p className="mt-1 leading-[1.4] text-mute" aria-live="polite">
            {progress
              ? `Saving… ${progress.done} of ${progress.total}`
              : on
                ? `${status!.count} ${status!.count === 1 ? "track" : "tracks"} on this phone. Play them with no connection; they update when you open Prepare.`
                : "Keep your kept tracks on this phone to play with no signal, like in the booth. Removed when you sign out."}
          </p>
          {error && <p className="mt-1 text-danger">{error}</p>}
        </div>
        {on || progress ? (
          <button type="button" onClick={turnOff} className="btn btn-sm btn-ghost shrink-0">
            Remove from phone
          </button>
        ) : (
          <button type="button" onClick={turnOn} disabled={!count} className="btn btn-sm btn-lime shrink-0">
            Save on this phone
          </button>
        )}
      </div>
    </div>
  );
}
