"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { segmentStep } from "./core";

/** The highlight is this wide; scaleX sizes it to the chosen option, so it never animates width. */
const BASE = 100;

/**
 * A segmented control (ops kit, from the prototype kit's segmented): a radio group of buttons. Arrow keys, Home and
 * End move and choose; only the chosen option is in the Tab order. The highlight slides with translateX and scaleX
 * (no width animation), and holds still with reduced motion.
 */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: V;
  options: readonly { value: V; label: React.ReactNode }[];
  onChange: (v: V) => void;
  className?: string;
}) {
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const group = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ x: number; s: number; anim: boolean } | null>(null);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const first = useRef(true);

  useLayoutEffect(() => {
    const measure = (anim: boolean) => {
      const b = btns.current[at];
      if (b) setPlace({ x: b.offsetLeft, s: b.offsetWidth / BASE, anim });
    };
    measure(!first.current);
    first.current = false;
    const ro = typeof ResizeObserver !== "undefined" && group.current ? new ResizeObserver(() => measure(false)) : null;
    if (ro && group.current) ro.observe(group.current);
    return () => ro?.disconnect();
  }, [at]);

  const choose = (i: number, focus: boolean) => {
    onChange(options[i].value);
    if (focus) btns.current[i]?.focus();
  };

  return (
    <div ref={group} role="radiogroup" aria-label={label} className={`kit-seg ${className}`}>
      <span aria-hidden className="kit-seg-ind" data-anim={place?.anim || undefined} style={place ? { transform: `translateX(${place.x}px) scaleX(${place.s})` } : { opacity: 0 }} />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            btns.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === at}
          tabIndex={i === at ? 0 : -1}
          onClick={() => choose(i, false)}
          onKeyDown={(e) => {
            const next = segmentStep(i, e.key, options.length);
            if (next === null) return;
            e.preventDefault();
            choose(next, true);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
