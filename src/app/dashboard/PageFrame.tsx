"use client";

import { usePathname } from "next/navigation";

/**
 * Screens that lay out against the whole content area: the Queue (its list sits beside a review column docked to
 * the right edge) and the Floor (one column centred in the space beside the sidebar, at every width; inside the
 * left-aligned frame it drifted left on wide screens). Account centres itself the same way (owner, 31 Oct).
 */
const FULL_BLEED = ["/dashboard/review", "/dashboard/floor", "/dashboard/account"];

/**
 * The one content frame for every dashboard page: left-aligned, 1088px of content plus the page's own gutters
 * (16px on phones, 32px from md up: `page-gutter`), so 1152px in all. Pages that read narrow keep a 704px text
 * column inside it (`page-narrow` on the element that carries the gutters). The Queue and the Floor opt out (full bleed).
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const full = FULL_BLEED.some((p) => path === p || path.startsWith(`${p}/`));
  // Full bleed: display contents, so the page lays out against <main> exactly as it did without a frame.
  return <div className={full ? "contents" : "max-w-6xl"}>{children}</div>;
}
