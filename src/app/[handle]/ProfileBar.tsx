"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps the receiver in view on the send page (owner, 29 Oct; option 48, 17 Nov). The full profile sits at the top
 * until a track is picked; from then on it collapses to a slim bar (photo, name, callout) that stays at the top of the
 * column through the form, the code, the upload and the sent step. Before a track is picked, the same slim bar comes
 * down from the top edge once the profile scrolls out, and leaves when it's back (screen readers skip that one: it
 * repeats the header). Reduced motion: it fades without moving.
 */
export function ProfileBar({ cover, name, callout, children }: { cover: string | null; name: string; callout: string | null; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const slim = (
    <>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" width={28} height={28} className="size-7 shrink-0 rounded-full object-cover" />
      )}
      <span className="min-w-0 truncate text-mute">
        <span className="font-semibold text-bone">{name}</span>
        {callout && ` · ${callout}`}
      </span>
    </>
  );
  return (
    <>
      <div ref={ref} className="group-has-[[data-picked]]/page:hidden">
        {children}
      </div>
      <p
        data-profile-slim
        className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-20 hidden items-center gap-2 rounded-[14px] border border-line bg-card px-3 py-2 text-[13px] group-has-[[data-picked]]/page:flex"
      >
        <span className="sr-only">Sending to </span>
        {slim}
      </p>
      <div
        aria-hidden
        data-profile-bar
        inert={!away}
        className={`fixed inset-x-0 top-0 z-30 border-b border-line bg-ink/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm transition-[opacity,translate] duration-200 ease-[var(--ease-out)] motion-reduce:translate-y-0 ${away ? "opacity-100" : "pointer-events-none -translate-y-full opacity-0"}`}
      >
        <div className="mx-auto flex h-12 max-w-[560px] items-center gap-2 px-4 text-[13px] sm:px-5">{slim}</div>
      </div>
    </>
  );
}
