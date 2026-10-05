import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Browser crashes (a page breaking on someone's phone) reach Sentry; the server can't see those.
// Reports go through our own address (/api/monitoring) so privacy blockers, such as Safari's advanced
// protection, don't flag the page for contacting a third party.
Sentry.init({ ...sentryOptions, tunnel: "/api/monitoring" });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
