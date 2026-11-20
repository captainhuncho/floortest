# PostHog: product analytics and session replay

Owner's yes in the Desk, 20 Nov 2026: posthog-js 1.453.0, EU region, installed as is.

## What runs and when
- Nothing loads until the visitor presses **Accept** on the cookie banner. Before a choice the page makes no request to
  PostHog and stores nothing of its own.
- Every new event is checked against the visitor's current choice before it is sent (`before_send` reads the consent
  cookie): after "Not now" or "Cookie settings" no new event is sent (page views on client navigation, replay flushes),
  whatever PostHog's own state, and an event caught this way also starts the withdrawal below on that page. PostHog's
  retry queue resends failed events without asking `before_send`, so withdrawal empties and switches it off first
  (below).
- If the choice changes while PostHog's file is still downloading, PostHog never starts and stores nothing.
- When consent leaves "accepted" while PostHog is live: capture is opted out first (so nothing flushed while stopping
  is sent), recording stops, the retry queue is emptied and switched off (its queue, timer and online listener; a send
  still in flight can't put itself back), persistence is switched off, every PostHog entry (and the toolbar's
  `_postHogToolbarParams`) is removed from localStorage, sessionStorage and cookies except PostHog's opt-out record,
  the site's other open tabs are told (a BroadcastChannel), and the page reloads. The banner asks again on the fresh
  page, where PostHog never starts and the opt-out record goes too. "Cookie settings" therefore reloads the page for a
  visitor who had accepted, and any other open tab of the site reloads with it.
- The retry queue is switched off through posthog-js 1.453.0's private names (`_retryQueue`, `_queue`, `_poller`,
  `_onlineListener`). The version is pinned exactly in `package.json`, and `tests/posthog-sdk-internals.test.ts` fails
  if an upgrade renames them: re-check `stopRetries` in `src/lib/posthog-client.ts` before any upgrade.
- Other tabs and returning pages: a tab that misses the message (opened before, or a page restored from the
  back-forward cache) checks the consent cookie again whenever it comes back into view (`pageshow`, `visibilitychange`,
  `focus`) and withdraws the same way.
- Events are sent one by one (`request_batching: false`), not batched, and page-leave events are off. An event
  captured while consent was still "accepted" is sent then; if that send fails, its retry is dropped at withdrawal.
- Never on the ops host (no banner there), and off entirely while `NEXT_PUBLIC_POSTHOG_KEY` is unset.
- The code: `src/components/ProductAnalytics.tsx` (mounted in the root layout) watches consent and the page;
  `src/lib/posthog-client.ts` loads PostHog and holds every setting; `src/lib/product-analytics.ts` has the rules (pages
  that may be recorded, redaction, storage clean-up). The "no-external" build is used: the recorder is bundled, so
  PostHog never loads a script from its servers, and the file downloads only after Accept.
- CSP: `connect-src` adds only `https://eu.i.posthog.com` (events). `script-src` is unchanged. What keeps PostHog's code
  off its servers is the bundled "no-external" build, not the host list (under `'strict-dynamic'` a script host would
  be ignored anyway). The project's remote settings host (`eu-assets.i.posthog.com`) is not allowed, since remote
  settings are never fetched.
- Storage after Accept: PostHog's `ph_…` entries in localStorage (persistence is set to localStorage) and its
  per-tab entries in sessionStorage (window id, session entry, replay buffer). On withdrawal all of them go, in this
  tab and in the other open tabs, except PostHog's opt-out record, which stays until the reload and then goes too.

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
  (`src/lib/redact-url.ts`), any `#fragment`, and every query key except `p`, `view`, `tab` and `folder` (and those
  only with a short plain value, `^[a-z0-9_-]{1,32}$`). Campaign and ad-click properties PostHog builds from the
  address (`utm_*`, `gad_source`, `mc_cid`, and every click id in posthog-js 1.453.0's list: `gclid`, `fbclid`,
  `msclkid`, `oppref`, `bfcid` and the rest; `ph_keyword`), plain, as `$initial_…` and as `$session_entry_…` (PostHog
  adds those to every event from the address the session started on), are dropped. Searches
  (`q`, `sender`, `genre`, `handle`, `ref`, `to`), invite codes, tokens and emails never leave the browser. PostHog's
  own personal-data masking is also on for `invite`, `team`, `token`, `email`, `code` and `next`. The page title is
  dropped (contact pages carry a sender's name).
- Replay masks every input, all text and all element attributes (links, labels), and blocks audio, video, images and
  canvas (covers, waveforms, file previews), plus anything marked `data-private`. Network entries keep only a redacted
  URL. Masking every attribute also masks `class` and `style`, so recordings will likely play back unstyled; useful
  styled replays would need an allow-list of safe attributes (owner's call).
- **Replay is on, masked** (owner, typed in the Desk, 20 Nov: "On, masked (recommended). Starts only after Accept.
  Typed text and addresses are hidden, and it never runs on sign-in, admin or payment pages."). PostHog starts a
  recording only when its project settings say replay is on; those settings are never fetched from PostHog
  (`advanced_disable_flags`, no flags or config request). Instead the code hands PostHog its own settings
  (`LOCAL_SETTINGS` in `src/lib/posthog-client.ts`, through the SDK's preloaded-settings slot) with only replay on, so
  the PostHog project can't switch anything else on, and every local "off" still wins. The recorder uploads nothing
  until the visitor interacts with the page.
- Replay runs only on an allow-list of pages: the desk's music pages (Floor, Review Queue and List, Collections,
  Prepare, Projects, Played out, Analytics, How it works) and the home page. Never on sign-in, sign-up, account,
  settings, contacts, private links, sender uploads, admin, pricing, plans or checkout. Never in an admin view (the
  dashboard layout marks it with `data-recording-off`). Recording stops when a client navigation to another page
  starts (`src/instrumentation-client.ts`), recording frames are dropped if the current page may not be recorded, and
  frames PostHog parked from an earlier page (a server redirect from a recorded page to sign-in) are thrown away when a
  page that may not be recorded opens. If PostHog fails to download or start, the error goes to Sentry (itself only
  after Accept) and the next page tries again.
- Speed measurement stays in-house (`TapSpeed`).

## Tests
- `tests/product-analytics.test.ts`: the allow-list, admin view, query allow-list and private-link redaction across
  every URL property (top-level `$set`/`$set_once` and replay frames included), title dropped, both storages and
  cookies cleared (toolbar key included), the opt-out record kept only while PostHog is live, campaign and ad-click
  properties dropped (plain, `$initial_…` and `$session_entry_…`), kept query values limited.
- `tests/posthog-sdk-internals.test.ts`: posthog-js is exactly 1.453.0 and its bundle still has the retry-queue names
  `stopRetries` uses.
- `e2e/product-analytics-consent.spec.ts`: zero PostHog requests and storage before a choice and after "Not now";
  after Accept, requests go to PostHog's EU hosts only, and the decoded request bodies after visiting a receipt, a
  collection link and invite sign-ups carry no key, code or title; no CSP block; "Cookie settings" stops sending and
  clears every storage at once; Accept then "Not now" sends nothing across the reload (beacons included) and leaves no
  PostHog storage; an event whose send failed before Cookie settings is not resent, even while a slowed (9 s) reload is still loading; withdrawing while
  PostHog's file is still downloading leaves no request and no storage; between Cookie settings and a slowed reload landing, a click and a client navigation send nothing; a session that starts on an address with `utm_term`, `gclid` and other campaign values never sends them (session-entry properties included); Cookie settings in one tab stops PostHog in another open tab and its storage stays gone; a tab that missed the withdrawal stops when it comes back into view; signed in, a search
  in the address (`?q=`, `sender=`) never reaches an event, including on a move from a
  recordable page to one that may not be recorded; signed in on an allowed page, replay frames are sent, and the decoded
  frames (compressed fields unpacked) carry the page address without its search, and none of the search secret,
  typed text, a heading's text, an aria-label or a link address; no replay on sign-in, sign-up or pricing; after a client
  navigation from an allowed page to one that may not be recorded, the recorder itself has stopped (a dev-only probe,
  `__ftRecording`, absent from production builds), and across back, forward and a pushState no frame carries that page. In e2e every PostHog request is answered locally (`e2e/fixtures.ts`) and the key is
  made up.

## Install note
- posthog-js pulls in `core-js`, which declares an install script (`hasInstallScript`, a postinstall banner). The
  install did not set `ignore-scripts` (the first commit's "scripts were not disabled"), but npm 11.19 here runs only
  approved install scripts: `allow-scripts` is empty and `dangerously-allow-all-scripts` is off, so the core-js
  postinstall did not run. Nothing in the app depends on it.

## Owner only
- Session replay is on, masked (owner's choice, 20 Nov). Nothing to switch on in the PostHog project: the code supplies
  the replay setting; check the project's replay retention.
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
