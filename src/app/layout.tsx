import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FloorTest — the receiving desk for unreleased music",
  description: "One permanent link routes every callout. Senders upload the original. FloorTest tells them what happens next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
