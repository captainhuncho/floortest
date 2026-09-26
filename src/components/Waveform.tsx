"use client";

import { useRef } from "react";

type Props = {
  peaks: number[] | null;
  progress?: number; // 0..1
  height?: number;
  onSeek?: (fraction: number) => void;
  label?: string;
  className?: string;
  dim?: boolean;
};

export function Waveform({ peaks, progress = 0, height = 36, onSeek, label, className = "", dim }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const data = peaks && peaks.length ? peaks : Array.from({ length: 90 }, () => 0.08);
  const n = data.length;
  const cut = progress * n;
  const interactive = !!onSeek;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${n * 3} ${height}`}
      preserveAspectRatio="none"
      className={`block w-full rounded-sm ${interactive ? "cursor-pointer" : ""} ${className}`}
      style={{ height }}
      onClick={(e) => {
        if (!onSeek || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onKeyDown={(e) => {
        if (!onSeek) return;
        const step = e.shiftKey ? 0.1 : 0.02;
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + step));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - step));
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "slider" : "img"}
      aria-hidden={interactive || label ? undefined : true}
      aria-label={label ?? (interactive ? "Playback position" : undefined)}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(progress * 100) : undefined}
      aria-valuetext={interactive ? `${Math.round(progress * 100)} percent` : undefined}
    >
      {data.map((p, i) => {
        const h = Math.max(1.5, p * (height - 2));
        return (
          <rect
            key={i}
            x={i * 3}
            y={(height - h) / 2}
            width={2}
            height={h}
            rx={1}
            className={i < cut ? "fill-lime" : dim ? "fill-dim" : "fill-mute/70"}
          />
        );
      })}
    </svg>
  );
}
