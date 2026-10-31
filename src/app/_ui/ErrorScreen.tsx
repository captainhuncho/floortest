"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { stored, useBrowserValue } from "@/components/useBrowserValue";
import { isStaleDeploy } from "@/lib/stale-deploy";
import { MessageInFrame, MessagePage, PRIMARY, SECONDARY } from "./MessagePage";

const RELOADED = "ft_reloaded_at";

/** Reload once by itself; if that already happened within a minute, show the screen instead of looping. Decided once. */
let reloadDecision: boolean | undefined;
const reloadOnce = () => (reloadDecision ??= Date.now() - Number(stored(RELOADED, "session") || 0) > 60_000);

export type ErrorProps = { error: Error & { digest?: string }; retry?: () => void; reset?: () => void };

/**
 * What every error boundary shows: a plain message only (owner, 31 Oct, "Hide the stack"). Never the error's message,
 * stack or digest, and no framework name: the error and its digest go to Sentry and the server log, where the digest
 * matches the server's own log line. The message is read only to spot the after-update case, never shown.
 * `page`: the whole page (logo, centred, follows the device's light or dark). Without it, a block for inside a frame
 * that already has its own (the desk keeps its menu). `home`: the way out.
 */
export function ErrorScreen({
  error,
  retry,
  reset,
  page = true,
  home = { href: "/", label: "Go to FloorTest" },
  ops = false,
}: ErrorProps & { page?: boolean; home?: { href: string; label: string }; ops?: boolean }) {
  const stale = isStaleDeploy(error);
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

  // retry (Next 16) fetches the segment again, so a server error that has passed clears; reset only re-renders.
  const again = retry ?? reset ?? (() => window.location.reload());
  const block = stale
    ? {
        icon: "up" as const,
        title: "FloorTest was just updated",
        children: <p>{reloading ? "Loading the new version…" : "Reload the page to continue. You may need to enter your details again."}</p>,
        actions: reloading ? undefined : (
          <button type="button" onClick={() => window.location.reload()} className={PRIMARY}>
            Reload
          </button>
        ),
      }
    : {
        icon: "x" as const,
        tone: "off" as const,
        title: "This page didn't load",
        children: (
          <p>
            Try again. If it keeps happening,{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- after an error, a full page load is the safer way out */}
            <a href="/contact" className="text-bone underline underline-offset-4">
              contact us
            </a>
            .
          </p>
        ),
        actions: (
          <>
            <button type="button" onClick={again} className={PRIMARY}>
              Try again
            </button>
            <Link href={home.href} className={SECONDARY}>
              {home.label}
            </Link>
          </>
        ),
      };

  if (page) return <MessagePage {...block} logo={!ops} system={!ops} />;
  return <MessageInFrame {...block} role="alert" />;
}
