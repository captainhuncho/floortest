import { Visits } from "@/components/Visits";
import { TapSpeed } from "@/components/TapSpeed";
import { NativeApp } from "@/components/NativeApp";
import { PullToRefresh } from "@/components/PullToRefresh";
import { NavProgress } from "@/components/NavProgress";
import { PageViews } from "@/components/PageViews";
import { ConsentBanner } from "@/components/ConsentBanner";
import { mono, serif } from "./fonts";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import "./globals.css";
import { env, isPreview } from "@/lib/env";
import { isOpsHost, OPS_SITE } from "@/lib/consent";

/** Zoom is never locked (WCAG 1.4.4). iOS Safari's zoom-on-focus is avoided by 16px fields on touch screens instead (globals.css).
 *  viewportFit cover: without it iOS reports every env(safe-area-inset-*) as 0 and the notch and home-bar paddings do nothing. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#10110f" };

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "FloorTest — the receiving desk for new music",
  description: "One receiving link for every callout, and it never changes. Senders upload the original. FloorTest tells them what happens next.",
  openGraph: { siteName: "FloorTest", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request, so each gets the fresh script nonce from src/proxy.ts (src/lib/csp.ts). A page
  // built ahead of time would carry no nonce and its scripts would be blocked (audit 27 Oct).
  await connection();
  // The ops host (staff only) gets no cookie banner and loads nothing optional (owner, 4 Nov 2026).
  const ops = isOpsHost((await headers()).get("host"), env.appUrl, env.opsUrl);
  return (
    // suppressHydrationWarning: the Android app writes its safe-area sizes onto <html> before React starts.
    <html lang="en" className={`${serif.variable} ${mono.variable}`} data-site={ops ? OPS_SITE : undefined} suppressHydrationWarning>
      <body className="site min-h-dvh">
        <NativeApp />
        {isPreview && (
          <p className="bg-lime px-4 py-1 text-center text-xs font-medium text-ink">Preview · test data only, separate from the live site</p>
        )}
        {children}
        {/* A tapped menu link shows at once; a thin line if the next page takes over 150ms (useNavPath.ts). */}
        <NavProgress />
        {/* Vercel Web Analytics and browser Sentry wait for Accept on the banner (owner's rule, 20 Oct 2026); none of
            the three is on the ops host. */}
        {/* Pull to refresh on every page (owner's rule): the desk, public pages, sign-in, messages and admin. */}
        <PullToRefresh />
        {!ops && <PageViews />}
        {/* In-house visit counts, after Accept on the banner like the page views: no cookie, id or IP kept, nothing sent to
            another company (owner, 5 Nov). */}
        {!ops && <Visits />}
        {!ops && <ConsentBanner />}
        {!isPreview && process.env.NODE_ENV === "production" && <TapSpeed />}
      </body>
    </html>
  );
}
