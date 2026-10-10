"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearOffline } from "@/lib/native-offline";

type Cap = { isNativePlatform?: () => boolean };
const LAST = "ft:last-place";
const DAY = 24 * 3_600_000;

/**
 * Only inside the FloorTest phone app (Capacitor): marks the page so app-only styles apply (no long-press callouts or
 * accidental text selection outside fields), remembers where you were on the desk, and takes you back there when the
 * app is reopened within a day, and wipes tracks saved for offline when you reach sign-in. Does nothing in an ordinary browser.
 */
export function NativeApp() {
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: Cap }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    document.documentElement.classList.add("native-app");
    // Signed out (or about to sign in as someone): tracks saved for offline leave the phone.
    if (["/signed-out", "/login", "/signup"].some((p) => path === p || path.startsWith(`${p}/`))) void clearOffline();
    try {
      if (path === "/dashboard/floor" && !sessionStorage.getItem("ft:restored")) {
        sessionStorage.setItem("ft:restored", "1");
        const last = JSON.parse(localStorage.getItem(LAST) || "null") as { path: string; at: number } | null;
        if (last && Date.now() - last.at < DAY && last.path.startsWith("/dashboard/") && !last.path.startsWith("/dashboard/floor")) {
          router.replace(last.path);
          return;
        }
      }
      if (path.startsWith("/dashboard/")) localStorage.setItem(LAST, JSON.stringify({ path: path + window.location.search, at: Date.now() }));
    } catch {}
  }, [path, router]);

  return null;
}
