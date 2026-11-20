import * as Sentry from "@sentry/nextjs";
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

/** Tells this site's other tabs that consent was withdrawn here, so their PostHog stops too. */
const CHANNEL = "ft-posthog-consent";
const WITHDRAWN = "withdrawn";

let loading: Promise<PostHog | null> | null = null;
let live: PostHog | null = null;
let withdrawing = false;
let channel: BroadcastChannel | null = null;

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
        if (!event) return null;
        if (readConsent() !== "accepted") {
          // Consent changed somewhere this page wasn't told (another tab): stop this copy too.
          queueMicrotask(() => withdraw(false));
          return null;
        }
        // Recording frames from a page that may not be recorded never leave the browser, even mid-navigation.
        if (event.event === "$snapshot" && !recordingAllowed(location.pathname, document)) return null;
        return redactEventUrls(event);
      },
    });
    live = posthog;
    watchConsentElsewhere();
    // e2e (next dev only, gone from production builds): whether the recorder is running right now.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __ftRecording?: () => boolean }).__ftRecording = () => !!posthog.sessionRecording?.started;
    }
    return posthog;
  }).catch((error: unknown) => {
    // A failed download or start: try again on the next page, and tell Sentry (which runs only after Accept too).
    loading = null;
    Sentry.captureException(error);
    return null;
  });
  return loading;
}

/**
 * The cookie-banner event reaches only this tab. Another tab's "Not now" or "Cookie settings" arrives here by a
 * BroadcastChannel message, and the cookie is checked again whenever this page comes back into view (another tab,
 * the back-forward cache, the window regaining focus).
 */
function watchConsentElsewhere() {
  const recheck = () => {
    if (live && readConsent() !== "accepted") withdraw(false);
  };
  window.addEventListener("pageshow", recheck);
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && recheck());
  if (typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (message) => message.data === WITHDRAWN && withdraw(false);
}

/**
 * Frames PostHog parked before the page changed (a server redirect from a recorded page to sign-in, say) are thrown
 * away on a page that may not be recorded, so they never leave later from another page.
 */
function dropPendingFrames() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith("ph_replay_pending_buffer_")) store.removeItem(key);
    } catch {
      // Storage blocked: nothing parked.
    }
  }
}

type RetryQueueInternals = {
  _queue?: unknown[];
  _poller?: ReturnType<typeof setTimeout>;
  _isPolling?: boolean;
  _onlineListener?: () => void;
  _offlineListener?: () => void;
  _enqueue?: unknown;
  _flush?: unknown;
  retriableRequest?: unknown;
};

/**
 * PostHog's retry queue resends failed events without asking before_send. On withdrawal it is emptied and switched
 * off before the reload: the queue, its timer and its online listener go, and any send still in flight can't put
 * itself back. These are posthog-js 1.453.0's private names (pinned exactly in package.json; a unit test checks the
 * bundle still has them). Its own unload() is not used: that sends what is queued as a beacon.
 */
function stopRetries(posthog: PostHog) {
  const queue = (posthog as unknown as { _retryQueue?: RetryQueueInternals })._retryQueue;
  if (!queue) return;
  const nothing = () => {};
  queue._queue = [];
  queue._enqueue = nothing;
  queue._flush = nothing;
  queue.retriableRequest = nothing;
  if (queue._poller) clearTimeout(queue._poller);
  queue._poller = undefined;
  queue._isPolling = false;
  if (queue._onlineListener) window.removeEventListener("online", queue._onlineListener);
  if (queue._offlineListener) window.removeEventListener("offline", queue._offlineListener);
  queue._onlineListener = undefined;
  queue._offlineListener = undefined;
}

/** Accepted: load (once) and record only where allowed. */
export function startForPage() {
  if (!KEY) return;
  load()
    .then((posthog) => {
      if (!posthog || withdrawing) return;
      // The page as it is now, not when loading began: the visitor may have moved on while PostHog downloaded.
      if (recordingAllowed(location.pathname, document)) posthog.startSessionRecording();
      else {
        posthog.stopSessionRecording();
        dropPendingFrames();
      }
    })
    .catch((error: unknown) => Sentry.captureException(error));
}

/**
 * Consent left "accepted" ("Not now" or "Cookie settings", here or in another tab). Where PostHog is live: opt out
 * first (so nothing flushed while stopping is sent), stop recording, empty and switch off the retry queue, keep nothing
 * more, clear the browser except PostHog's opt-out record, tell the other tabs, then reload. The reload ends anything
 * PostHog still holds, and the banner asks again on the fresh page. Where PostHog never started, everything of
 * PostHog's is removed, the opt-out record included.
 */
export function withdraw(tellOtherTabs = true) {
  if (withdrawing) return;
  const wasLive = live !== null;
  if (live) {
    withdrawing = true;
    live.opt_out_capturing();
    live.stopSessionRecording();
    stopRetries(live);
    live.set_config({ disable_persistence: true });
  }
  try {
    clearPosthogStorage([localStorage, sessionStorage], document, wasLive);
  } catch {
    // Storage blocked: nothing to clear.
  }
  if (!wasLive) return;
  if (tellOtherTabs) channel?.postMessage(WITHDRAWN);
  location.reload();
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
