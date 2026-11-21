"use client";

import { Icon } from "@/components/Kit";

/**
 * Phones only: "‹ More" goes back to where this page lives, the More sheet in the menu (MobileTabBar.tsx). The sheet
 * has no address of its own, so this opens it by pressing the menu's More button.
 */
export function BackToMore() {
  const open = () => document.querySelector<HTMLButtonElement>('nav[data-tabbar] button[aria-haspopup="dialog"]')?.click();
  return (
    <button type="button" onClick={open} className="tap-text -ml-1 inline-flex min-h-11 w-fit items-center gap-1 px-1 text-[14px] text-mute hover:text-bone md:hidden">
      <Icon name="chev" className="size-4 rotate-180" />
      More
    </button>
  );
}
