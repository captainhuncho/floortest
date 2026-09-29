import type { Metadata } from "next";
import "./globals.css";
import { env, isPreview } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "FloorTest — the receiving desk for unreleased music",
  description: "One permanent link routes every callout. Senders upload the original. FloorTest tells them what happens next.",
  openGraph: { siteName: "FloorTest", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {isPreview && (
          <p className="bg-lime px-4 py-1 text-center text-xs font-medium text-ink">Preview · test data only, separate from the live site</p>
        )}
        {children}
      </body>
    </html>
  );
}
