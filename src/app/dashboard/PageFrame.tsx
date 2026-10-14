"use client";

import { usePathname } from "next/navigation";

/** Screens that use the whole width: the Queue's list sits beside a review column docked to the right edge. */
const FULL_BLEED = ["/dashboard/review"];

/**
 * The one content frame for every dashboard page: left-aligned, 1088px of content plus the page's own gutters
 * (16px on phones, 32px from md up: `page-gutter`), so 1152px in all. Pages that read narrow keep a 704px text
 * column inside it (`page-narrow` on the element that carries the gutters). The Queue opts out (full bleed).
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const full = FULL_BLEED.some((p) => path === p || path.startsWith(`${p}/`));
  // Full bleed: display contents, so the page lays out against <main> exactly as it did without a frame.
  return <div className={full ? "contents" : "max-w-6xl"}>{children}</div>;
}
