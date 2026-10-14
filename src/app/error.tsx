"use client";

import * as Sentry from "@sentry/nextjs";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { stored, useBrowserValue } from "@/components/useBrowserValue";

/**
 * A page left open across an update still holds the old version's code: its buttons call server actions or load
 * files that no longer exist. Those errors mean "reload", not "something broke".
 */
const STALE = /server action|older or newer deployment|chunkloaderror|loading chunk|dynamically imported module|importing a module script failed|unexpected response was received from the server/i;
const RELOADED = "ft_reloaded_at";

/** Reload once by itself; if that already happened within a minute, show the screen instead of looping. Decided once. */
let reloadDecision: boolean | undefined;
const reloadOnce = () => (reloadDecision ??= Date.now() - Number(stored(RELOADED, "session") || 0) > 60_000);

/** Last-resort error screen. The digest lets you find the matching server log line. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = STALE.test(`${error.name} ${error.message}`);
  const reloading = useBrowserValue(() => stale && reloadOnce(), false);

  useEffect(() => {
    if (!stale) {
      // Errors caught here never reach the browser's crash handler, so report them to Sentry directly.
      Sentry.captureException(error);
      return;
    }
    if (!reloading) return;
    try {
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {}
    window.location.reload();
  }, [error, stale, reloading]);

  // On ops (admin/error.tsx re-exports this page) the admin menu already shows the silver crest.
  const onOps = usePathname()?.startsWith("/admin");
  const logo = onOps ? null : <Logo className="mb-10" />;

  if (stale)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
        {logo}
        <h1 className="text-3xl font-bold tracking-tight">FloorTest was just updated</h1>
        <p className="mt-3 text-mute">{reloading ? "Loading the new version…" : "Reload the page to continue. You may need to enter your details again."}</p>
        {!reloading && (
          <div className="mt-8">
            <button onClick={() => window.location.reload()} className="btn-lime min-h-11">
              Reload
            </button>
          </div>
        )}
      </main>
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
      {logo}
      <h1 className="text-3xl font-bold tracking-tight">This page didn&apos;t load</h1>
      <p className="mt-3 text-mute">
        Sorry about that. Try again, and if it keeps happening, let us know{error.digest ? ` and mention code ${error.digest}` : ""}.
      </p>
      <div className="mt-8 flex gap-3">
        <button onClick={reset} className="btn-lime">
          Try again
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- after an error, a full page load is the safer way out */}
        <a href="/contact" className="btn-ghost">
          Contact us
        </a>
      </div>
    </main>
  );
}
