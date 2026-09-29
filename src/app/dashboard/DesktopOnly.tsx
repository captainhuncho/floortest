"use client";

import { useEffect, useState } from "react";

const query = "(min-width: 768px)";

/** Mount children only at one screen size, so parts with global listeners (keys, swipes) exist once. */
function useWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function DesktopOnly({ children }: { children: React.ReactNode }) {
  return useWide() === true ? <>{children}</> : null;
}

export function MobileOnly({ children }: { children: React.ReactNode }) {
  return useWide() === false ? <>{children}</> : null;
}
