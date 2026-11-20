# App Store review check

Checked against the guidelines as of 16 Oct 2026; re-checked 20 Nov 2026.

Source: Apple's App Store Review Guidelines (https://developer.apple.com/app-store/review/guidelines/, page
"Last Updated: October 16, 2026", read 20 Nov 2026). Code checked on `main` at `907ae88e`. First check: 31 Oct 2026 at
`a42fa21`.

FloorTest already has a phone app: `mobile/` is a Capacitor shell (`mobile/capacitor.config.ts`) that opens
floortest.app on the desk (`/dashboard/floor`), with an Xcode project in `mobile/ios` (targets App and ShareExtension)
and an Android one in `mobile/android`. It has not been submitted. The store listing draft is `mobile/store-listing.md`;
the plan is `docs/06-plan.md` → Mobile app.

Status: **meets** (built and in the code), **gap** (needed before submitting, not built or not right yet),
**owner** (needs the owner: accounts, App Store Connect, legal wording), **n/a**, **not verified** (could not be
checked from the repo).

## Summary: what blocks a submission
1. **No in-app purchase, and the plans page is not changed inside the app** (2.1(b), 3.1.1, 3.1.2, 3.1.3(b)). Nothing
   with StoreKit exists yet. The plans page shows prices and upgrade buttons in the app exactly as on the website; once
   the `billing` switch is on, they lead to the web card checkout. Restore Purchases exists only as a placeholder row in
   Settings.
2. **"Website in a wrapper" risk** (4.2). Native parts are built (background audio, lock-screen controls, share
   extension, offline crate, haptics, offline screen), but there are no push notifications. Reviewers must see the
   native parts, and the review notes must name them.
3. **Store listing out of date** (2.3, 5.1). `mobile/store-listing.md` still promises Sign in with Apple next to Google,
   and its privacy table disagrees with the privacy manifest (crash data, analytics provider, linked or not).
4. **Owner steps:** Apple Developer account, App Store Connect record, a production demo account for review, the age
   rating, the App Store privacy labels, subscription products, and the lawyer's sign-off on the privacy policy.

## Guideline by guideline

| Guideline | What Apple asks | Status | Evidence |
|---|---|---|---|
| 1.2 User-generated content | Filter objectionable material, report with timely responses, block abusive users, published contact details | meets | Uploads are scanned before they are accepted: `src/lib/scan.ts:54` (`scanStored`). Receivers block senders: `src/app/dashboard/actions/review.ts:267` (`blockSender`); list and unblock in `src/app/dashboard/settings/receiving/page.tsx:17`. Staff block: `src/app/admin/actions.ts:416` (`blockSenderAsAdmin`), `:762` (`blockEverywhere`). Report button on every track (Details): reason, optional note, admins and owners can block in the same step; goes to the admin inbox and support email: `src/app/dashboard/actions/report.ts`, `src/app/dashboard/ReportTrack.tsx`, e2e `e2e/report-track.spec.ts`. Contact form topics "Report abuse", "Impersonation", "Copyright claim": `src/app/contact/ContactForm.tsx:35`; takedown policy `src/app/takedown/page.tsx`. Tracks are private to the receiver (no public feed). Response time for reports is a process, not code: not verified. |
| 1.2.1(a) Creator content age limits | Age gate where content exceeds the rating | n/a | No public creator content. Terms require 18+: `src/app/terms/page.tsx:24`. |
| 1.5 Developer information | Easy way to contact the developer, in the app and at the Support URL | meets | `/contact` (`src/app/contact/page.tsx`), reachable inside the app; Support URL `https://floortest.app/contact` in `mobile/store-listing.md:12`. |
| 2.1(a) App completeness, demo account | Final build, working URLs, demo account, back end live | owner | The seed demo account (`scripts/seed.ts`) is local only. A demo account on floortest.app with sample tracks is needed (`mobile/store-listing.md:36` says so). |
| 2.1(b) In-app purchases complete and reviewable | IAP complete, visible to the reviewer, working; explain in notes if not | **gap** | No in-app purchases in the code: no StoreKit, no `/api/v1/billing/apple/*`, no `store_entitlements` table (searched `src/`, `mobile/ios/`, `src/lib/db/migrations.ts`). See 3.1.1. |
| 2.3 Accurate metadata | Metadata and privacy information match the app; new features described specifically in review notes; screenshots show the app in use | **gap** | Draft in `mobile/store-listing.md`. Out of date: line 39 says "Sign in with Apple is offered next to Google sign-in (to be built before submission)"; the app hides Google instead (see 4.8) and has no Sign in with Apple. Privacy table (lines 41-51) disagrees with the privacy manifest (see 5.1.2). The description promises background audio, lock-screen controls, share-to-FloorTest and offline crates; each must work in the submitted build. Screenshots from demo data only (listing line 66). |
| 2.5 Software requirements | Public APIs only, background modes only for their purpose | meets | Background mode `audio` only, to keep playing tracks under review: `mobile/ios/App/App/Info.plist:64-66`. `localhost` in `WKAppBoundDomains` and `NSAllowsLocalNetworking` sit inside `#if FLOORTEST_LOCAL` (`Info.plist:38`, `:94`); only the App target's Debug configuration defines it (`project.pbxproj:427-428`, `INFOPLIST_PREPROCESSOR_DEFINITIONS = "FLOORTEST_LOCAL=1"`). A Release build was checked with `plutil` on 31 Oct; not rebuilt in this check. |
| 2.5.2 Self-contained, no downloaded code changing features | No new features shipped outside review | meets with care | The app loads floortest.app (`mobile/capacitor.config.ts`, `server.url`). Website changes reach the app without review; keep new app-only features in reviewed builds. |
| 2.5.6 WebKit | Web content through WebKit | meets | Capacitor iOS uses `WKWebView`; release builds limit it to app-bound domains (`capacitor.config.ts`, `limitsNavigationsToAppBoundDomains: release`; `Info.plist:91`). |
| 3.1.1 In-app purchase | Digital features unlocked only through IAP; restore mechanism for restorable purchases | **gap** | Owner 15 Nov: Apple IAP with Restore Purchases (StoreKit 2 `AppStore.sync()` / `Transaction.currentEntitlements`, re-checked on the server); the app sells Pro and Team, monthly and yearly; web checkout and its links hidden in the app only. Not built. Today, in the app: plans page upgrade buttons go to `/dashboard/checkout` once the `billing` switch is on (`src/app/dashboard/plans/PlanCards.tsx:181`); the checkout is a card form marked "Card payments aren't connected yet" (`src/app/dashboard/checkout/page.tsx`). No web payment provider is wired in the code yet (Paddle appears only in a comment, `src/lib/db/migrations.ts:1606`). During the beta (`billing` off) plans are free and bigger plans are by request (`/dashboard/plans/request`), so nothing is sold today. |
| 3.1.1 Restore Purchases (owner rule) | Visible Restore Purchases on the paywall and in settings, calling the store's restore | **gap** | Settings → Plan → "Your plan" sheet shows a "Restore purchases" row in the phone app only (`src/app/dashboard/settings/(index)/PlanRow.tsx:54-58`), but it only shows a toast ("Nothing to restore. Plans are free in the beta."); it does not call StoreKit or check entitlements on the server. No Restore Purchases on the plans page (paywall): `src/app/dashboard/plans/page.tsx`, `PlanCards.tsx`. |
| 3.1.2 Subscriptions | At least 7 days, all the user's devices, clear description of what the price includes, no accidental double subscriptions | **gap** | Four App Store subscriptions planned (Pro and Team, monthly and yearly; seats stay on the web), products set up by the owner in App Store Connect. Not built. The plans page already lists features per plan (`PlanCompare.tsx`, `plan-lines.ts`) and renewal terms (`plans/page.tsx:95-123`); the IAP paywall must say exactly what each price includes. Web and App Store subscriptions must not stack for one desk (server check, not built). |
| 3.1.3(b) Multiplatform services | Purchases made on the website may unlock the app; no in-app calls to buy elsewhere (3.1.1(a)) | **gap** | Plans set on the web already work in the app (one account, server-side plan). But the app does not hide web checkout: there is no in-app check on the plans or checkout pages (the only in-app checks are `src/lib/in-app.ts` used by log-in and sign-up, and `PlanRow.tsx`'s `inPhoneApp`). Met once the plans and checkout pages switch to IAP inside the app (part of the 3.1.1 work). |
| 4.2 Minimum functionality | More than a repackaged website; useful, unique, app-like | **gap (risk)** | Native parts built: background audio (`Info.plist:64-66`) with lock-screen controls through Media Session (`src/lib/media-session.ts`, `src/lib/use-media-session.ts`); share extension into Send (`mobile/ios/App/ShareExtension/ShareViewController.swift`, `mobile/ios/App/App/ShareInboxPlugin.swift`, app group `group.app.floortest` in both `.entitlements`); offline crate (`mobile/ios/App/App/OfflineCratePlugin.swift`, `src/lib/native-offline.ts`); haptics (`@capacitor/haptics` in `mobile/package.json`) and native pull to refresh (`src/components/usePullToRefresh.ts`); app-only behaviour (`src/components/NativeApp.tsx`); own offline screen (`mobile/www/index.html`, `errorPath`). No push notifications: no push plugin in `mobile/package.json`, no `aps-environment` entitlement. The app is still the website at its core; push would strengthen the case. Name the native features in the review notes. |
| 4.8 Login services | A third-party login as the primary account needs an equivalent private option | meets (once the app is rebuilt) | Owner 15 Nov: Google sign-in hidden inside the app, kept on the website. The app adds `FloorTestApp` to its user agent (`mobile/capacitor.config.ts`, `appendUserAgent`); `src/lib/in-app.ts` reads it (`src/lib/app-ua.ts`); log-in and sign-up drop the Google button (`src/app/(auth)/login/page.tsx:32`, `src/app/(auth)/signup/page.tsx:68`). Email code, password and passkeys (website) stay. No Sign in with Apple in the code. Builds made before this change still show Google until rebuilt. Check: Settings → Security still shows "Google sign-in" (connect and Remove) inside the app (`src/app/dashboard/settings/security/page.tsx:53-59`); Remove is useful (5.1.1(v)), but connecting Google from inside the app should be reviewed. |
| 5.1.1(i) Privacy policy | Linked in App Store Connect and inside the app | meets in app; owner for listing | In-app link: Settings → Privacy, `src/app/dashboard/settings/(index)/page.tsx:183`; policy at `/privacy`. App Store Connect field: owner. Policy wording is the lawyer's. |
| 5.1.1(ii) Consent for data collection | Consent before collecting user or usage data, even anonymous; easy withdrawal | meets | Vercel Analytics and browser Sentry load only after Accept on the cookie banner (`src/components/ConsentBanner.tsx:9`); "Cookie settings" reopens it, and a reload stops them (`:42`). |
| 5.1.1(iii)/(iv) Data minimisation, permissions | Ask only for what the app needs, clear purpose strings | meets | No camera, microphone, photos, contacts, location or tracking usage strings in `mobile/ios/App/App/Info.plist`; files come through the system share sheet and picker. |
| 5.1.1(v) Account sign-in and deletion | Account deletion inside the app; a way to revoke social credentials | meets | Settings → ••• → Delete account: `src/app/dashboard/settings/(index)/SettingsMenu.tsx:84`, `:114`, confirm step `:234`; action `src/app/dashboard/actions/settings.ts:191` (type DELETE FLOORTEST plus two-step code if on; switched off at once, every session ends, purged after 14 days unless restored, `src/lib/account-deletion.ts`). Google can be removed in Settings → Security (`src/app/dashboard/settings/GoogleSignIn.tsx`, `src/lib/google-link.ts`). Sign-in is needed because the app is a private inbox (listing review notes, line 36). |
| 5.1.2 Data use, tracking (ATT) | No tracking without App Tracking Transparency; disclose third-party sharing | meets | No IDFA, no ad SDKs, no `NSUserTrackingUsageDescription`; manifest says `NSPrivacyTracking` false. |
| 5.1.1 / 5.1.2 Privacy manifest | Required-reason APIs declared in PrivacyInfo.xcprivacy; manifest and privacy labels agree | meets in code; **gap** in listing | `mobile/ios/App/App/PrivacyInfo.xcprivacy`: tracking false, no tracking domains; required-reason APIs UserDefaults CA92.1 (`SceneDelegate.swift:31-32`, share ids) and file timestamp C617.1 (`ShareInboxPlugin.swift:17,20`; `OfflineCratePlugin.swift:136`). Collected data: linked, app functionality: email, name, user ID, audio, other user content; not linked: crash data (app functionality), performance data (app functionality), product interaction (analytics). None for tracking. `mobile/ios/App/ShareExtension/PrivacyInfo.xcprivacy`: tracking false, no data types, no required-reason APIs. Both in Copy Bundle Resources (`project.pbxproj:235`, `:243`). The listing's privacy table (`mobile/store-listing.md:41-51`) says product interaction is linked and "our own, first-party", and crash data "No"; the manifest says both are collected and not linked, and the web uses Vercel Analytics and Sentry after consent. The App Store Connect labels (owner) must match the manifest. IAP will add purchase history. |
| 5.2 Intellectual property | Rights holders can complain; no infringing content | meets | Notice and takedown: `src/app/takedown/page.tsx`; content rules `src/app/content-rules/page.tsx`. |
| Age rating | Questionnaire in App Store Connect | owner | Terms say 18+ (`src/app/terms/page.tsx:24`); the listing draft suggests 12+ or 18+ (`mobile/store-listing.md:11`). Owner to pick; 18+ matches the terms. |

## Gaps

| Guideline | What's missing | Evidence | Who fixes |
|---|---|---|---|
| 2.1(b), 3.1.1 | StoreKit in-app purchase for Pro and Team, server check of Apple transactions | No StoreKit or Apple billing code in `src/` or `mobile/ios/` | Build (code); owner sets up products in App Store Connect |
| 3.1.1 (owner rule) | Real Restore Purchases on the plans page and in Settings, calling the store and re-checking on the server, with a plain result message | `PlanRow.tsx:54-58` shows a toast only; nothing on `plans/page.tsx` | Build |
| 3.1.2 | Four subscriptions, paywall that states what each price includes, no stacking with a web plan | Not built | Build (code); owner (App Store Connect products, prices) |
| 3.1.3(b), 3.1.1(a) | Inside the app, plans and checkout pages must not lead to web checkout or other purchase calls to action | `PlanCards.tsx:181` links to `/dashboard/checkout` when `billing` is on; no in-app check on those pages | Build |
| 4.2 | Stronger native case: push notifications (planned); review notes that name each native feature | No push plugin or `aps-environment`; native features listed in the 4.2 row | Build (push); owner (review notes in App Store Connect) |
| 2.3 | Listing still promises Sign in with Apple next to Google | `mobile/store-listing.md:39` | Build (doc fix in the listing draft); owner (final text in App Store Connect) |
| 5.1.1 / 5.1.2 | Privacy table in the listing disagrees with the privacy manifest (crash data, analytics provider, linked or not) | `mobile/store-listing.md:41-51` vs `mobile/ios/App/App/PrivacyInfo.xcprivacy` | Owner (App Store Connect labels; confirm rows); Build (bring the listing draft in line) |
| 4.8 (check) | Decide whether "Connect Google" in Settings → Security should be hidden in the app (keep Remove) | `src/app/dashboard/settings/security/page.tsx:53-59` | Owner decides; Build changes code |
| 2.1(a) | Demo account on floortest.app with sample tracks | `scripts/seed.ts` is local only | Owner |
| 5.1.1(i) | Privacy policy URL in App Store Connect; policy wording | `/privacy`; open items in `docs/legal-review.md` | Owner (lawyer for wording) |
| Age rating | Pick and answer the questionnaire | Terms 18+; listing undecided | Owner |

## Not verified
- 1.2 "timely responses": how fast reports are handled is a process, not code.
- 2.5: the Release `Info.plist` was checked with `plutil` on 31 Oct; no new iOS build was made in this check.
- 4.2: whether lock-screen controls and background audio work on a current device build; checked from code only.
- 4.8: whether the installed test build includes the user-agent change (only builds made after 15 Nov do).
- Anything in App Store Connect (record, labels, products, review notes): not visible from the repo.

## Owner steps
- Enrol in the Apple Developer Program (company, D-U-N-S) and create the App Store Connect record (`app.floortest`).
- Create the review demo account on floortest.app with sample tracks, and put it in the review notes.
- Set up the subscription products in App Store Connect once in-app purchase is built.
- Answer the age rating and the App Store privacy labels, matching `PrivacyInfo.xcprivacy`.
- Lawyer: privacy policy wording (open items in `docs/legal-review.md`).

## Build steps (each on its own branch, then the Desk)
1. In-app purchase with StoreKit, Restore Purchases on the plans page and in Settings, server checks of Apple
   transactions; hide web checkout and purchase links inside the app.
2. ~~Sign in with Apple, or Google sign-in hidden in the app.~~ Done: Google hidden in the app, see 4.8.
3. ~~Report button on a track in the desk.~~ Done, see 1.2.
4. ~~Release build: drop `localhost` and local networking from `Info.plist`.~~ Done: Debug only, see 2.5.
5. Push notifications (strengthens 4.2).
6. Bring `mobile/store-listing.md` in line: drop the Sign in with Apple line, match the privacy table to the manifest.
