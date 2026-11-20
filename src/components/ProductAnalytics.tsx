"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { PostHog } from "posthog-js/dist/module.full.no-external";
import { clearPosthogStorage, mayRecord, POSTHOG_HOST, POSTHOG_UI_HOST, redactEventUrls } from "@/lib/product-analytics";
import { useConsent } from "@/lib/use-consent";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let client: Promise<PostHog> | null = null;

/**
 * The "no-external" build has the recorder inside, so PostHog never loads another script from its own servers
 * (script-src stays as it is) and the file downloads only after Accept.
 */
function load(): Promise<PostHog> {
  client ??= import("posthog-js/dist/module.full.no-external").then(({ posthog }) => {
    posthog.init(KEY!, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      persistence: "localStorage",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      disable_external_dependency_loading: true,
      disable_surveys: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        blockSelector: "audio, video, img, canvas, [data-private]",
      },
      before_send: (event) => (event ? redactEventUrls(event) : event),
    });
    return posthog;
  });
  return client;
}

/**
 * Product analytics and session replay, only after Accept on the cookie banner (owner's rule; PostHog, EU region). Before
 * Accept or after "Not now" nothing loads and nothing is stored; withdrawing reloads the page (ConsentBanner), and any
 * PostHog storage left from before is removed. Nobody is identified: no email, name or account id is sent. Recording
 * stops on sign-in, account, admin, plans and checkout pages (src/lib/product-analytics.ts).
 */
export function ProductAnalytics() {
  const consent = useConsent();
  const path = usePathname();

  useEffect(() => {
    if (consent === "rejected" || consent === null) {
      try {
        clearPosthogStorage(localStorage, document);
      } catch {
        // Storage blocked: nothing to clear.
      }
      return;
    }
    if (consent !== "accepted" || !KEY) return;
    let live = true;
    load().then((posthog) => {
      if (!live) return;
      if (path && mayRecord(path)) posthog.startSessionRecording();
      else posthog.stopSessionRecording();
    });
    return () => {
      live = false;
    };
  }, [consent, path]);

  return null;
}
