"use client";

import { useEffect, useRef, useState } from "react";

/** The recordings open on one blank frame before the page draws; every play and every loop starts just after it. */
const LEAD = 0.1;
const start = (v: HTMLVideoElement) => {
  if (v.currentTime < LEAD) v.currentTime = LEAD;
  void v.play().catch(() => {});
};

/**
 * A muted motion loop from docs/rollout/motion: plays only while on screen, can be paused, and never plays for people
 * who ask for less motion (they see the poster, which is the loop's story frame).
 */
export function Loop({ name, label, className = "", videoClass = "" }: { name: string; label: string; className?: string; videoClass?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !v.dataset.userPaused) start(v);
      else v.pause();
    }, { threshold: 0.3 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      delete v.dataset.userPaused;
      start(v);
      setPaused(false);
    } else {
      v.dataset.userPaused = "1";
      v.pause();
      setPaused(true);
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <video
        ref={ref}
        src={`/motion/${name}.webm`}
        poster={`/motion/${name}-poster.png`}
        muted
        onEnded={(e) => {
          e.currentTarget.currentTime = LEAD;
          start(e.currentTarget);
        }}
        playsInline
        preload="metadata"
        aria-label={label}
        className={`block w-full ${videoClass}`}
      />
      {/* No pause control when nothing plays: reduced motion shows the poster. */}
      <button
          type="button"
          onClick={toggle}
          aria-label={paused ? `Play: ${label}` : `Pause: ${label}`}
          className="tap absolute bottom-2 left-2 grid size-8 motion-reduce:hidden place-items-center rounded-full border border-line-2 bg-ink/80 text-[10px] text-mute hover:text-bone"
        >
          {paused ? "▶" : "II"}
      </button>
    </div>
  );
}
