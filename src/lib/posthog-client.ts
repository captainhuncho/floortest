import type { PostHog } from "posthog-js/dist/module.full.no-external";
import { readConsent } from "./consent";
import { clearPosthogStorage, POSTHOG_HOST, POSTHOG_UI_HOST, recordingAllowed, redactAnalyticsUrl, redactEventUrls, SECRET_QUERY_KEYS } from "./product-analytics";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * PostHog's project settings, supplied here instead of fetched (the SDK reads this before it would ask its servers, and
 * advanced_disable_flags keeps it from asking). Only one thing is switched on: session replay (owner, 20 Nov: "On,
 * masked"). No flags, and nothing else from the project; every local "off" below still wins.
 */
const LOCAL_SETTINGS = { sessionRecording: { endpoint: "/s/" }, hasFeatureFlags: false, capturePerformance: false };

let loading: Promise<PostHog | null> | null = null;
let live: PostHog | null = null;

/**
 * Every optional feature is set here, in the code, so the PostHog project's own settings can't switch one on: no
 * autocapture (clicks), flags, surveys, heatmaps, page-leave, performance, console, network, canvas, exception,
 * dead-click, tour or chat capture. The "no-external" build has the recorder inside, so PostHog never loads a script from
 * its servers (disable_external_dependency_loading does nothing in this build; it stays as a second lock). Events are
 * sent one by one, not batched; a failed send can wait in PostHog's retry queue, which withdraw() ends with a reload.
 */
function load(): Promise<PostHog | null> {
  loading ??= import("posthog-js/dist/module.full.no-external").then(({ posthog }) => {
    // The choice may have changed while the file was downloading: then PostHog never starts and stores nothing.
    if (readConsent() !== "accepted") {
      loading = null;
      return null;
    }
    (window as unknown as { _POSTHOG_REMOTE_CONFIG?: Record<string, { config: unknown }> })._POSTHOG_REMOTE_CONFIG = {
      [KEY!]: { config: LOCAL_SETTINGS },
    };
    posthog.init(KEY!, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      persistence: "localStorage",
      person_profiles: "identified_only",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: false,
      request_batching: false,
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
        captureCanvas: { recordCanvas: false },
        recordHeaders: false,
        recordBody: false,
        maskCapturedNetworkRequestFn: (request) => ({ ...request, name: redactAnalyticsUrl(request.name) }),
      },
      before_send: (event) => {
        // The visitor's current choice is checked on every event, whatever PostHog itself thinks: nothing leaves after
        // "Not now" or "Cookie settings", from any path (page views, replay flushes, beacons).
        if (!event || readConsent() !== "accepted") return null;
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
    if (!posthog) return;
    if (recordingAllowed(path, document)) posthog.startSessionRecording();
    else posthog.stopSessionRecording();
  });
}

/**
 * Consent left "accepted" ("Not now" or "Cookie settings"). Where PostHog is live: opt out first (so nothing flushed
 * while stopping is sent), stop recording, keep nothing more, clear the browser except PostHog's opt-out record, then
 * reload. The reload is what ends PostHog's retry queue, which would otherwise resend an event that failed earlier, and
 * the banner asks again on the fresh page. Where PostHog never started, everything of PostHog's is removed, the
 * opt-out record included.
 */
export function withdraw() {
  const wasLive = live !== null;
  if (live) {
    live.opt_out_capturing();
    live.stopSessionRecording();
    live.set_config({ disable_persistence: true });
  }
  try {
    clearPosthogStorage([localStorage, sessionStorage], document, wasLive);
  } catch {
    // Storage blocked: nothing to clear.
  }
  if (wasLive) location.reload();
}

/** Called as a client navigation starts (src/instrumentation-client.ts), so a page that may not be recorded never is. */
export function beforeNavigate(href: string) {
  if (!live) return;
  try {
    const path = new URL(href, location.origin).pathname;
    if (!recordingAllowed(path, document)) live.stopSessionRecording();
  } catch {
    // A bad address or a recorder error must never block navigation; before_send still drops disallowed frames.
  }
}
