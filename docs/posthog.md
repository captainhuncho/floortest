# PostHog: product analytics and session replay

Owner's yes in the Desk, 20 Nov 2026: posthog-js 1.453.0, EU region, installed as is.

## What runs and when
- Nothing loads until the visitor presses **Accept** on the cookie banner. Before a choice the page makes no request to
  PostHog and stores nothing of its own.
- When consent leaves "accepted" ("Not now", or "Cookie settings" reopening the banner), at once and without a reload:
  recording stops, capture is opted out, the visitor is reset, persistence is switched off for the rest of the page, and
  every PostHog entry is removed from localStorage, sessionStorage and cookies. "Not now" then also reloads the page
  (ConsentBanner), and page-leave events are off, so nothing is sent on the way out.
- Never on the ops host (no banner there), and off entirely while `NEXT_PUBLIC_POSTHOG_KEY` is unset.
- The code: `src/components/ProductAnalytics.tsx` (mounted in the root layout) watches consent and the page;
  `src/lib/posthog-client.ts` loads PostHog and holds every setting; `src/lib/product-analytics.ts` has the rules (pages
  that may be recorded, redaction, storage clean-up). The "no-external" build is used: the recorder is bundled, so
  PostHog never loads a script from its servers, and the file downloads only after Accept.
- CSP: `connect-src` adds `https://eu.i.posthog.com` (events) and `https://eu-assets.i.posthog.com` (the project's
  settings, fetched as data). `script-src` is unchanged.
- Storage after Accept: PostHog's `ph_…` entries in localStorage (persistence is set to localStorage) and its
  per-tab entries in sessionStorage (window id, session entry, replay buffer). All of them go on withdrawal.

## Privacy settings in the code
Every optional feature is set in the code, so the PostHog project's own settings can't switch one on.
- Nobody is identified: no email, name or account id is sent through identify. Visitors are anonymous PostHog ids.
- Off: feature flags (no flags request), surveys, product tours, chat, heatmaps, page-leave, performance and web
  vitals, console logs, network headers and bodies, exceptions, dead clicks, referrer and campaign storage.
- Every URL-like property (current page, referrer, session entry, initial page, previous page, also inside `$set` and
  `$set_once`) loses private-link keys (`src/lib/redact-url.ts`) and the values of `invite`, `team`, `token`, `email`,
  `code` and `next` in query strings, before any event leaves the browser. PostHog's own personal-data masking is on
  for the same keys. The page title is dropped (contact pages carry a sender's name).
- Autocapture masks all element text and attributes.
- Replay masks every input, all text and all element attributes (links, labels), and blocks audio, video, images and
  canvas (covers, waveforms, file previews), plus anything marked `data-private`. Network entries keep only a redacted
  URL.
- Replay runs only on an allow-list of pages: the desk's music pages (Floor, Review Queue and List, Collections,
  Prepare, Projects, Played out, Analytics, How it works), the home page and Pricing. Never in an admin view (the
  dashboard layout marks it with `data-recording-off`). Recording stops when a client navigation to another page
  starts (`src/instrumentation-client.ts`), and recording frames are dropped if the current page may not be recorded.
- Speed measurement stays in-house (`TapSpeed`).

## Tests
- `tests/product-analytics.test.ts`: the allow-list, admin view, query and private-link redaction across every URL
  property, title dropped, both storages and cookies cleared.
- `e2e/product-analytics-consent.spec.ts`: zero PostHog requests and storage before a choice and after "Not now";
  after Accept, requests go to PostHog's EU hosts only, and the decoded request bodies after visiting a receipt, a
  collection link and invite sign-ups carry no key, code or title; no CSP block; "Cookie settings" stops sending and
  clears every storage at once. In e2e every PostHog request is answered locally (`e2e/fixtures.ts`) and the key is
  made up.

## Owner only
- The cookie banner says "count visits and collect crash reports": it doesn't mention product analytics or session
  replay yet, and the policy pages have no PostHog wording. That wording is the owner's and the lawyer's, and it must be
  in place before this goes live.
- PostHog account in the **EU** region; the project key into Vercel as `NEXT_PUBLIC_POSTHOG_KEY` (preview and production).
- In PostHog: a billing limit and alert, data retention, "discard client IP data" on, session replay settings checked.
- A data processing agreement with PostHog.

## Draft notes for the policy pages (owner's and lawyer's wording; the legal pages are not edited here)
- Cookie Policy: after Accept, PostHog (PostHog Inc., data hosted in the EU) stores an anonymous id in localStorage
  (`ph_<key>_posthog`) and per-tab entries in sessionStorage to count usage and record masked sessions; removed after
  "Not now" or "Cookie settings".
- Privacy Policy: product analytics and masked session recordings with PostHog, only with consent; no names, emails or
  typed text; retention per the PostHog project setting.
- Subprocessors list: PostHog Inc., product analytics and session replay, EU (Frankfurt).
