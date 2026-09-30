import { mono, serif } from "./fonts";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { env, isPreview } from "@/lib/env";

/** maximumScale stops iOS Safari zooming in on small text fields and staying zoomed; people can still pinch-zoom. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#10110f" };

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "FloorTest — the receiving desk for unreleased music",
  description: "One permanent link routes every callout. Senders upload the original. FloorTest tells them what happens next.",
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
      </body>
    </html>
  );
}
