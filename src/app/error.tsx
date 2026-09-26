"use client";

import { useEffect } from "react";

/** Last-resort error screen. The digest lets you find the matching server log line. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-mute">
        Sorry about that. Try again, and if it keeps happening, let us know{error.digest ? ` and mention code ${error.digest}` : ""}.
      </p>
      <div className="mt-8 flex gap-3">
        <button onClick={reset} className="btn-lime">
          Try again
        </button>
        <a href="/contact" className="btn-ghost">
          Contact us
        </a>
      </div>
    </main>
  );
}
