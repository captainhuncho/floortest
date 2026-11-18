"use client";

import { FormError } from "@/components/Feedback";
import { useEffect, useState } from "react";
import { clearOffline, offlineAvailable, offlineStatus, onOfflineProgress, syncOffline, type OfflineStatus } from "@/lib/native-offline";
import { IconBox } from "@/components/Kit";
import { useBrowserValue } from "@/components/useBrowserValue";

/**
 * Phone apps only: keep the kept tracks on this phone to play with no connection (the offline screen becomes a player).
 * Once on, opening Prepare brings the phone's copy in line: new keeps are saved, cleared or deleted tracks leave the phone.
 * One row with a switch (owner, 17 Nov: option 44); with nothing kept and nothing saved the row is hidden, and the
 * phone's copy is still brought in line.
 */
export function OfflineSave({ count }: { count: number }) {
  // Only inside the phone apps.
  const shown = useBrowserValue(offlineAvailable, false);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const on = status?.owner !== undefined && status.owner !== null;
  const active = on || !!progress;

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

  if (!shown || (!count && !active)) return null;

  async function turnOn() {
    setError("");
    if (!(await syncOffline())) return setError("Couldn't start saving to this phone. Check your connection and try again.");
    setProgress({ done: 0, total: count });
  }

  async function turnOff() {
    await clearOffline();
    setProgress(null);
    setStatus(await offlineStatus());
  }

  return (
    <section aria-labelledby="offline-h" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <IconBox name="lock" small />
        <div className="min-w-0 flex-1">
          <h2 id="offline-h" className="text-[14px] font-semibold text-bone">
            Save on this phone
          </h2>
          <p className="mt-0.5 text-[12px] leading-[1.4] text-mute tnum" aria-live="polite">
            {progress
              ? `Saving ${progress.done} of ${progress.total} · keep the app open`
              : on
                ? `${status!.count} ${status!.count === 1 ? "track" : "tracks"} saved · play them with no signal`
                : "Play your crate with no signal"}
          </p>
        </div>
        {/* 44px to tap; the track inside is the 32px switch. No slide with reduced motion. */}
        <button type="button" role="switch" aria-checked={active} aria-labelledby="offline-h" disabled={!count && !active} onClick={active ? turnOff : turnOn} className="grid h-11 w-[52px] shrink-0 place-items-center rounded-full disabled:opacity-40">
          <span className={`relative block h-8 w-[52px] rounded-full border transition-colors motion-reduce:transition-none ${active ? "border-transparent bg-lime" : "border-line-2 bg-well"}`}>
            <span className={`absolute left-[3px] top-1/2 size-6 -translate-y-1/2 rounded-full transition-transform motion-reduce:transition-none ${active ? "translate-x-5 bg-[#10110f]" : "bg-mute"}`} />
          </span>
        </button>
      </div>
      <FormError>{error}</FormError>
    </section>
  );
}
