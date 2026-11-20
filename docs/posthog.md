# PostHog: product analytics and session replay

Owner's yes in the Desk, 20 Nov 2026: posthog-js 1.453.0, EU region, installed as is.

## What runs and when
- Nothing loads until the visitor presses **Accept** on the cookie banner. Before a choice the page makes no request to
  PostHog and stores nothing of its own.
- Every event is checked against the visitor's current choice just before it would leave (`before_send` reads the
  consent cookie): after "Not now" or "Cookie settings" nothing is sent, from any path (page views on client
  navigation, replay flushes, beacons), whatever PostHog's own state.
- When consent leaves "accepted", at once and without a reload: capture is opted out first (so nothing flushed while
  stopping is sent), recording stops, persistence is switched off for the rest of the page, and every PostHog entry is
  removed from localStorage, sessionStorage and cookies, except PostHog's opt-out record, which stays while PostHog is
  live on the page so it keeps knowing the visitor said no (no reset, which would remove it). "Not now" then reloads
  the page (ConsentBanner); on that load PostHog never starts and the opt-out record goes too.
- Events are sent one by one (`request_batching: false`), never held in a queue, and page-leave events are off, so
  nothing is left waiting to go out on the reload. An event captured while consent was still "accepted" is sent then,
  not later.
- Never on the ops host (no banner there), and off entirely while `NEXT_PUBLIC_POSTHOG_KEY` is unset.
- The code: `src/components/ProductAnalytics.tsx` (mounted in the root layout) watches consent and the page;
  `src/lib/posthog-client.ts` loads PostHog and holds every setting; `src/lib/product-analytics.ts` has the rules (pages
  that may be recorded, redaction, storage clean-up). The "no-external" build is used: the recorder is bundled, so
  PostHog never loads a script from its servers, and the file downloads only after Accept.
- CSP: `connect-src` adds `https://eu.i.posthog.com` (events) and `https://eu-assets.i.posthog.com` (the project's
  settings, fetched as data; not fetched today, see Replay). `script-src` is unchanged.
- Storage after Accept: PostHog's `ph_…` entries in localStorage (persistence is set to localStorage) and its
  per-tab entries in sessionStorage (window id, session entry, replay buffer). All of them go on withdrawal.

## Privacy settings in the code
Every optional feature is set in the code, so the PostHog project's own settings can't switch one on.
- Nobody is identified: no email, name or account id is sent through identify. Visitors are anonymous PostHog ids.
- Off: autocapture (no clicks or form events are captured; only page views), feature flags and the project's remote
  settings (no flags or config request), surveys, product tours, chat, heatmaps, page-leave, performance and web
  vitals, console logs, network headers and bodies, canvas recording, exceptions, dead clicks, referrer and campaign
  storage. `disable_external_dependency_loading` is set but does nothing in the "no-external" build (nothing external
  to load); it stays as a second lock.
- Every URL-like property (current page, referrer, session entry, initial page, previous page, in the properties, in
  `$set` and `$set_once` at the top of the event, and the page address in replay frames) loses private-link keys
  (`src/lib/redact-url.ts`), any `#fragment`, and every query key except `p`, `view`, `tab` and `folder`. Searches
  (`q`, `sender`, `genre`, `handle`, `ref`, `to`), invite codes, tokens and emails never leave the browser. PostHog's
  own personal-data masking is also on for `invite`, `team`, `token`, `email`, `code` and `next`. The page title is
  dropped (contact pages carry a sender's name).
- Replay masks every input, all text and all element attributes (links, labels), and blocks audio, video, images and
  canvas (covers, waveforms, file previews), plus anything marked `data-private`. Network entries keep only a redacted
  URL.
- **Replay does not run today.** PostHog starts a recording only when the project's remote settings say replay is on,
  and those settings are never fetched (`advanced_disable_flags`, so the project can't switch features on). Turning
  replay on is an owner decision and a new Safety review. Everything below is in place for that day.
- Replay would run only on an allow-list of pages: the desk's music pages (Floor, Review Queue and List, Collections,
  Prepare, Projects, Played out, Analytics, How it works), the home page and Pricing. Never in an admin view (the
  dashboard layout marks it with `data-recording-off`). Recording stops when a client navigation to another page
  starts (`src/instrumentation-client.ts`), and recording frames are dropped if the current page may not be recorded.
- Speed measurement stays in-house (`TapSpeed`).

## Tests
- `tests/product-analytics.test.ts`: the allow-list, admin view, query allow-list and private-link redaction across
  every URL property (top-level `$set`/`$set_once` and replay frames included), title dropped, both storages and
  cookies cleared, the opt-out record kept only while PostHog is live.
- `e2e/product-analytics-consent.spec.ts`: zero PostHog requests and storage before a choice and after "Not now";
  after Accept, requests go to PostHog's EU hosts only, and the decoded request bodies after visiting a receipt, a
  collection link and invite sign-ups carry no key, code or title; no CSP block; "Cookie settings" stops sending and
  clears every storage at once; Accept then "Not now" sends nothing across the reload (beacons included) and leaves no
  PostHog storage; after the footer's Cookie settings a click and a client navigation send nothing; signed in, a search
  in the address (`?q=`, `sender=`) never reaches an event, and no replay request is sent, including on a move from a
  recordable page to one that may not be recorded. In e2e every PostHog request is answered locally (`e2e/fixtures.ts`) and the key is
  made up.

## Install note
- posthog-js pulls in `core-js`, which declares an install script (`hasInstallScript`, a postinstall banner). npm here
  holds install scripts until approved; it was not approved, so it never ran. Nothing in the app depends on it.

## Owner only
- Session replay: on (fetch the project's remote settings, with replay switched on in PostHog) or off for now. Off is
  how it ships today.
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
