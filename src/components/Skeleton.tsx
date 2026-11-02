/**
 * Parts for the loading.tsx skeletons: grey shapes laid out like the page they stand in for, so nothing jumps when the
 * page arrives. The frame fades in only after 150ms (.skeleton-in, globals.css), so a quick page change shows nothing,
 * and its pulse stops for reduced motion. `tone` picks the grey: "app" for the desk and public pages, "ops" for admin.
 */
const GREY = { app: "bg-well", ops: "bg-ink-4" } as const;
export type SkeletonTone = keyof typeof GREY;

/** One line of text: a rounded bar. `className` sets its width (and height, if not the default 12px). */
export function SkLine({ className = "", tone = "app" }: { className?: string; tone?: SkeletonTone }) {
  return <div className={`h-3 rounded-full ${GREY[tone]} ${className}`} />;
}

/** A solid shape (a title, a picture, a button): `className` gives its size and corners. */
export function SkBlock({ className = "", tone = "app" }: { className?: string; tone?: SkeletonTone }) {
  return <div className={`${GREY[tone]} ${className}`} />;
}

/**
 * The frame: says "Loading" to screen readers once, fades in late, pulses. `outer` is the page's own outer box (its
 * gutter and padding), `className` its column; both copy the real page so the skeleton sits where the page will.
 */
export function SkeletonFrame({ outer = "", className = "", children }: { outer?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`skeleton-in ${outer}`} role="status" aria-busy="true" aria-label="Loading">
      <div className={`animate-pulse motion-reduce:animate-none ${className}`}>{children}</div>
    </div>
  );
}
