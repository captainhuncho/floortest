import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Browser crashes (a page breaking on someone's phone) reach Sentry; the server can't see those.
// Reports go through our own address (/api/monitoring) so privacy blockers, such as Safari's advanced
// protection, don't flag the page for contacting a third party.
// Tracing headers go only to our own API, never to an audio request: those redirect to the storage bucket, which
// refuses unknown headers (CORS), so the waveform drawn on first play would never load.
const notAudio = "(?!api/tracks/\\d+/audio)";
Sentry.init({
  ...sentryOptions,
  tunnel: "/api/monitoring",
  tracePropagationTargets: [new RegExp(`^/(?!/)${notAudio}`), new RegExp(`^${window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${notAudio}`)],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
