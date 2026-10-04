import { Analytics } from "@vercel/analytics/next";
import { mono, serif } from "./fonts";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { env, isPreview } from "@/lib/env";

/** Zoom is never locked (WCAG 1.4.4). iOS Safari's zoom-on-focus is avoided by 16px fields on touch screens instead (globals.css). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10110f" };

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "FloorTest — the receiving desk for unreleased music",
  description: "One receiving link for every callout, and it never changes. Senders upload the original. FloorTest tells them what happens next.",
  openGraph: { siteName: "FloorTest", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {isPreview && (
          <p className="bg-lime px-4 py-1 text-center text-xs font-medium text-ink">Preview · test data only, separate from the live site</p>
        )}
        {children}
        {/* Cookie-free page-view counts (Vercel Web Analytics): no personal data, no consent banner needed. */}
        <Analytics />
      </body>
    </html>
  );
}
