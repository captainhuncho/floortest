import { TapSpeed } from "@/components/TapSpeed";
import { NativeApp } from "@/components/NativeApp";
import { PageViews } from "@/components/PageViews";
import { ConsentBanner } from "@/components/ConsentBanner";
import { mono, serif } from "./fonts";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { env, isPreview } from "@/lib/env";

/** Zoom is never locked (WCAG 1.4.4). iOS Safari's zoom-on-focus is avoided by 16px fields on touch screens instead (globals.css). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10110f" };

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "FloorTest — the receiving desk for new music",
  description: "One receiving link for every callout, and it never changes. Senders upload the original. FloorTest tells them what happens next.",
  openGraph: { siteName: "FloorTest", type: "website" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request, so each gets the fresh script nonce from src/proxy.ts (src/lib/csp.ts). A page
  // built ahead of time would carry no nonce and its scripts would be blocked (audit 27 Oct).
  await connection();
  return (
    // suppressHydrationWarning: the Android app writes its safe-area sizes onto <html> before React starts.
    <html lang="en" className={`${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="site min-h-dvh">
        <NativeApp />
        {isPreview && (
          <p className="bg-lime px-4 py-1 text-center text-xs font-medium text-ink">Preview · test data only, separate from the live site</p>
        )}
        {children}
        {/* Vercel Web Analytics and browser Sentry wait for Accept on the banner (owner's rule, 20 Oct 2026). */}
        <PageViews />
        <ConsentBanner />
        {!isPreview && process.env.NODE_ENV === "production" && <TapSpeed />}
      </body>
    </html>
  );
}
