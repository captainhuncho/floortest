"use client";

import { useRef, useState } from "react";
import { fmtTime } from "@/lib/format";

type Props = {
  peaks: number[] | null;
  progress?: number; // 0..1
  height?: number;
  onSeek?: (fraction: number) => void;
  label?: string;
  className?: string;
  dim?: boolean;
  /** Track length in seconds, so screen readers hear "0:42 of 6:12" rather than a percentage. */
  duration?: number;
};

export function Waveform({ peaks, progress = 0, height = 36, onSeek, label, className = "", dim, duration }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const data = peaks && peaks.length ? peaks : Array.from({ length: 90 }, () => 0.08);
  const n = data.length;
  const cut = progress * n;
  const interactive = !!onSeek;
  // Mouse hover previews where a click would land: the bars up to the cursor light a little (owner, 1 Nov).
  const [hover, setHover] = useState<number | null>(null);
  const hoverCut = hover == null ? -1 : hover * n;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${n * 3} ${height}`}
      preserveAspectRatio="none"
      className={`block w-full rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-lime ${interactive ? "cursor-pointer" : ""} ${className}`}
      style={{ height }}
      onClick={(e) => {
        if (!onSeek || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onPointerMove={(e) => {
        if (!interactive || e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onPointerLeave={() => setHover(null)}
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
      aria-valuetext={interactive ? (duration ? `${fmtTime(progress * duration)} of ${fmtTime(duration)}` : `${Math.round(progress * 100)} percent`) : undefined}
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
            className={`transition-[fill-opacity] duration-100 ${i < cut ? "fill-lime" : dim ? "fill-dim" : "fill-wave"}`}
            fillOpacity={i >= cut && i < hoverCut ? 1 : i < cut ? 1 : 0.85}
          />
        );
      })}
      {interactive && progress > 0 && progress < 1 && <rect x={Math.max(0, cut * 3 - 1)} y={0} width={1.5} height={height} rx={0.75} className="fill-bone" opacity={0.9} />}
      {hover != null && <rect x={Math.max(0, hover * n * 3 - 0.75)} y={0} width={1} height={height} className="fill-bone" opacity={0.45} />}
    </svg>
  );
}
