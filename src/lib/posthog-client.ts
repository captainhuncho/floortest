import type { PostHog } from "posthog-js/dist/module.full.no-external";
import { clearPosthogStorage, POSTHOG_HOST, POSTHOG_UI_HOST, recordingAllowed, redactAnalyticsUrl, redactEventUrls, SECRET_QUERY_KEYS } from "./product-analytics";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

let loading: Promise<PostHog> | null = null;
let live: PostHog | null = null;

/**
 * Every optional feature is set here, in the code, so the PostHog project's own settings can't switch one on: no flags,
 * surveys, heatmaps, page-leave, performance, console, network, exception, dead-click, tour or chat capture. The
 * "no-external" build has the recorder inside, so PostHog never loads a script from its servers.
 */
function load(): Promise<PostHog> {
  loading ??= import("posthog-js/dist/module.full.no-external").then(({ posthog }) => {
    posthog.init(KEY!, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      persistence: "localStorage",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      capture_pageleave: false,
      advanced_disable_flags: true,
      save_referrer: false,
      save_campaign_params: false,
      mask_personal_data_properties: true,
      custom_personal_data_properties: SECRET_QUERY_KEYS,
      disable_external_dependency_loading: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      capture_heatmaps: false,
      capture_performance: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      enable_recording_console_log: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        maskAllElementAttributes: true,
        blockSelector: "audio, video, img, canvas, [data-private]",
        recordHeaders: false,
        recordBody: false,
        maskCapturedNetworkRequestFn: (request) => ({ ...request, name: redactAnalyticsUrl(request.name) }),
      },
      before_send: (event) => {
        if (!event) return event;
        // Recording frames from a page that may not be recorded never leave the browser, even mid-navigation.
        if (event.event === "$snapshot" && !recordingAllowed(location.pathname, document)) return null;
        return redactEventUrls(event);
      },
    });
    live = posthog;
    return posthog;
  });
  return loading;
}

/** Accepted: load (once) and record only where allowed. */
export function startForPage(path: string) {
  if (!KEY) return;
  load().then((posthog) => {
    // Accepted again on the same page after a withdrawal.
    if (posthog.has_opted_out_capturing()) {
      posthog.set_config({ disable_persistence: false });
      posthog.opt_in_capturing();
    }
    if (recordingAllowed(path, document)) posthog.startSessionRecording();
    else posthog.stopSessionRecording();
  });
}

/** Consent left "accepted" ("Not now" or "Cookie settings"): stop at once, forget the visitor, clear the browser. */
export function withdraw() {
  if (live) {
    live.stopSessionRecording();
    live.opt_out_capturing();
    live.reset();
    // Keep nothing more in the browser for the rest of this page (storage is cleared just below).
    live.set_config({ disable_persistence: true });
  }
  try {
    clearPosthogStorage([localStorage, sessionStorage], document);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** Called as a client navigation starts (src/instrumentation-client.ts), so a page that may not be recorded never is. */
export function beforeNavigate(href: string) {
  if (!live) return;
  const path = new URL(href, location.origin).pathname;
  if (!recordingAllowed(path, document)) live.stopSessionRecording();
}
