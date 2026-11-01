"use client";

import Link from "next/link";
import { useEffect } from "react";
import { acceptedEarlierOnThisPage, clearConsent, COOKIE_SETTINGS_HASH, writeConsent } from "@/lib/consent";
import { useConsent } from "@/lib/use-consent";

/**
 * Asks before Vercel Analytics or browser Sentry run (owner's rule, 20 Oct 2026). Accept and Not now are the same size
 * on the same bar, and both are remembered. Any link to #cookie-settings (footer, sign-in pages) brings it back.
 * `policyHref`: the Cookie Policy link, the main site's page when shown on the ops host (root layout).
 */
export function ConsentBanner({ policyHref = "/cookies" }: { policyHref?: string }) {
  const consent = useConsent();

  useEffect(() => {
    const reopen = () => {
      if (window.location.hash !== COOKIE_SETTINGS_HASH) return;
      clearConsent();
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.(`a[href$="${COOKIE_SETTINGS_HASH}"]`);
      if (!link) return;
      event.preventDefault();
      clearConsent();
    };
    reopen();
    window.addEventListener("hashchange", reopen);
    // Capture phase, so this runs before next/link and the page doesn't navigate to the hash.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", reopen);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (consent !== null) return null;

  const decline = () => {
    writeConsent("rejected");
    // Analytics and Sentry can't be unloaded once running; a reload stops them.
    if (acceptedEarlierOnThisPage()) window.location.reload();
  };

  const button =
    "tap inline-flex min-h-11 min-w-28 items-center justify-center rounded-full border border-line-strong px-5 text-sm text-bone hover:border-bone";

  return (
    <section
      aria-labelledby="consent-heading"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-ink-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p id="consent-heading" className="text-sm text-mute">
          Can we count visits and collect crash reports so we can fix problems? Neither runs unless you say yes.{" "}
          <Link href={policyHref} className="underline hover:text-bone">
            Cookie Policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={button} onClick={() => writeConsent("accepted")}>
            Accept
          </button>
          <button type="button" className={button} onClick={decline}>
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
