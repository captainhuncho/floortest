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
        <h1>Something went wrong</h1>
        <p>Sorry about that. Reload the page, and if it keeps happening, contact us{error.digest ? ` and mention code ${error.digest}` : ""}.</p>
      </body>
    </html>
  );
}
