import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";
import { onConsentChange, readConsent } from "./lib/consent";

// Browser crashes (a page breaking on someone's phone) reach Sentry; the server can't see those.
// Reports go through our own address (/api/monitoring) so privacy blockers, such as Safari's advanced
// protection, don't flag the page for contacting a third party.
// Tracing headers go only to our own API, never to an audio request: those redirect to the storage bucket, which
// refuses unknown headers (CORS), so the waveform drawn on first play would never load.
// Browser reports start only after the visitor accepts on the cookie banner (owner's rule, 20 Oct 2026): at load when
// they already have, or the moment they do. Server-side reports (no IP, no personal data) are unaffected.
const notAudio = "(?!api/tracks/\\d+/audio)";
let started = false;
function startSentry() {
  if (started) return;
  started = true;
  Sentry.init({
    ...sentryOptions,
    tunnel: "/api/monitoring",
    tracePropagationTargets: [new RegExp(`^/(?!/)${notAudio}`), new RegExp(`^${window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${notAudio}`)],
  });
}
if (readConsent() === "accepted") startSentry();
else onConsentChange((consent) => consent === "accepted" && startSentry());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
