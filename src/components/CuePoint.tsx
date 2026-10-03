/**
 * FloorTest's verified mark ("Cue Point", Figma: Product System / Abstract verification). Used instead of a checkmark,
 * at 16, 20 or 24px. Pass `label` where the mark stands alone; leave it out when "Verified" text sits beside it.
 */
export function CuePoint({ size = 16, label, className = "" }: { size?: 16 | 20 | 24; label?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/cue-point.svg"
      width={size}
      height={size}
      alt={label ?? ""}
      title={label}
      className={`inline-block shrink-0 align-middle ${className}`}
    />
  );
}
