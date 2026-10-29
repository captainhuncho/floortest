"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** When even the root layout fails: a bare page, and the crash still reaches Sentry. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ background: "#10110f", color: "#f1f1eb", fontFamily: "'JetBrains Mono', monospace", padding: "48px 16px" }}>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the whole app failed, so the router may be gone: a plain link and image are the safest */}
        <a href="/" aria-label="FloorTest home" style={{ display: "inline-block", marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
          <img draggable={false} src="/brand/crest.svg" alt="FloorTest" width={28} height={29} style={{ display: "block" }} />
        </a>
        <h1>This page didn&apos;t load</h1>
        <p>Sorry about that. Reload the page, and if it keeps happening, contact us{error.digest ? ` and mention code ${error.digest}` : ""}.</p>
      </body>
    </html>
  );
}
