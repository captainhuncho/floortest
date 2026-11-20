# PostHog: product analytics and session replay

Owner's yes in the Desk, 20 Nov 2026: posthog-js 1.453.0, EU region, installed as is.

## What runs and when
- Nothing loads until the visitor presses **Accept** on the cookie banner. Before a choice and after "Not now" the page
  makes no request to PostHog and stores nothing of its own. Withdrawing ("Cookie settings", then "Not now") reloads the
  page, so PostHog stops from the next page, and any PostHog storage left in the browser is removed.
- Never on the ops host (no banner there), and off entirely while `NEXT_PUBLIC_POSTHOG_KEY` is unset.
- The code is `src/components/ProductAnalytics.tsx` (mounted in the root layout) and the rules are
  `src/lib/product-analytics.ts`. The "no-external" build is used: the recorder is bundled, so PostHog never loads a
  script from its own servers, and the file downloads only after Accept.
- Events go to `https://eu.i.posthog.com` only; that host is the one addition to the CSP (`connect-src`). `script-src`
  is unchanged.
- Storage after Accept: PostHog's own `ph_…` entry in localStorage (persistence is set to localStorage, not cookies).

## Privacy settings in the code
- Nobody is identified: no email, name or account id is sent. Visitors are anonymous PostHog ids.
- Autocapture masks all element text and attributes.
- Replay masks every input and all text, and blocks audio, video, images and canvas (covers, waveforms, file previews),
  plus anything marked `data-private`.
- Replay never runs on sign-in, sign-up, password and private-link pages, account and settings, admin, view-as, plans
  and checkout (list in `src/lib/product-analytics.ts`).
- Private-link keys are removed from every URL property before an event leaves the browser (`src/lib/redact-url.ts`).
- Speed measurement stays in-house (`TapSpeed`); PostHog's web-vitals are not used for it.

## Tests
- `tests/product-analytics.test.ts`: pages never recorded, URL keys removed, storage cleared after "Not now".
- `e2e/product-analytics-consent.spec.ts`: zero PostHog requests and no PostHog storage before a choice and after
  "Not now"; after Accept, requests go to the EU host only. In e2e every PostHog request is answered locally
  (`e2e/fixtures.ts`) and the key is made up.

## Owner only
- PostHog account in the **EU** region; the project key into Vercel as `NEXT_PUBLIC_POSTHOG_KEY` (preview and production).
- In PostHog: a billing limit and alert, data retention, "discard client IP data" on, session replay settings checked.
- A data processing agreement with PostHog.

## Draft notes for the policy pages (owner's and lawyer's wording; the legal pages are not edited here)
- Cookie Policy: after Accept, PostHog (PostHog Inc., data hosted in the EU) stores an anonymous id in localStorage
  (`ph_<key>_posthog`) to count usage and record masked sessions; removed after "Not now".
- Privacy Policy: product analytics and masked session recordings with PostHog, only with consent; no names, emails or
  typed text; retention per the PostHog project setting.
- Subprocessors list: PostHog Inc., product analytics and session replay, EU (Frankfurt).
