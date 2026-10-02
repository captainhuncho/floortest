import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Browser crashes (a page breaking on someone's phone) reach Sentry; the server can't see those.
Sentry.init(sentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
