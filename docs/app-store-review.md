# App Store review check

Checked 31 Oct 2026 against Apple's App Store Review Guidelines
(https://developer.apple.com/app-store/review/guidelines/, read the same day), on `main` at `a42fa21`.

FloorTest already has a phone app: `mobile/` is a Capacitor shell (`mobile/capacitor.config.ts`) that opens
floortest.app on the desk, with an Xcode project in `mobile/ios` and an Android one in `mobile/android`. It has not
been submitted. The store listing draft is `mobile/store-listing.md`; the plan is `docs/06-plan.md` → Mobile app.

Status: **meets** (built and in the code), **gap** (needed before submitting, not built or not right yet),
**owner** (needs the owner: accounts, App Store Connect, legal wording), **n/a**.

## Summary: what blocks a submission
1. **Paid plans use the website's checkout inside the app** (3.1.1). The app must sell plans through Apple in-app
   purchase, with a Restore Purchases button, and must not link to web checkout. Not built.
2. **Google sign-in with no Sign in with Apple** (4.8). Either add Sign in with Apple or hide Google sign-in in the app.
3. **"Website in a wrapper" risk** (4.2). The native parts (background audio, lock screen, share extension, offline
   crate, haptics) are the case for approval; they must be visible to the reviewer and described in the review notes.
4. **Owner steps:** Apple Developer account, App Store Connect record, a production demo account for review, the age
   rating, the privacy label, and the lawyer's sign-off on the privacy policy.

## Guideline by guideline

| Guideline | What Apple asks | Status | Evidence |
|---|---|---|---|
| 1.2 User-generated content | Filter objectionable material, a way to report it, block abusive users, published contact details | meets | Uploads are scanned before they are accepted: `src/lib/scan.ts:54`. Receivers block senders: `src/app/dashboard/actions/review.ts:244`, list and unblock at `src/app/dashboard/settings/receiving/page.tsx:45`; staff can block too: `src/app/admin/actions.ts:248`. Contact form with "Report abuse", "Impersonation" and "Copyright claim": `src/app/contact/ContactForm.tsx:35`; takedown policy `src/app/takedown/page.tsx`. Tracks are private to the receiver (no public feed). Report button on every track in the desk (Details): reason, optional note, admins and owners can block in the same step; lands in the admin inbox and support email: `src/app/dashboard/actions/report.ts`, `src/app/dashboard/ReportTrack.tsx` (e2e `e2e/report-track.spec.ts`). |
| 1.2.1(a) Creator content age limits | Age gate where content exceeds the rating | n/a | No public creator content. Terms require 18+: `src/app/terms/page.tsx:24`. |
| 1.5 Developer information | Easy way to contact the developer | meets | `/contact` (`src/app/contact/page.tsx`); support URL in `mobile/store-listing.md`. |
| 2.1(a) App completeness, demo account | Final build, working URLs, demo account and back end on | owner | The seed demo account (`scripts/seed.ts:3`) is local only. A demo account on floortest.app with sample tracks is needed for review (listing notes already say so). |
| 2.1(b) In-app purchases visible to review | IAP complete and reviewable | gap | No in-app purchases yet (see 3.1.1). |
| 2.3 Accurate metadata | Screenshots and text match the app | owner | Draft in `mobile/store-listing.md`. Its description promises background audio, lock-screen controls, share-to-FloorTest and offline crates; each must work in the submitted build. Screenshots from demo data only. |
| 2.5 Software requirements | Public APIs only, background modes only for their purpose | meets | Background mode is `audio` only, used to keep playing tracks under review: `mobile/ios/App/App/Info.plist:66`. `localhost` in `WKAppBoundDomains` and `NSAllowsLocalNetworking` sit inside `#if FLOORTEST_LOCAL` in `Info.plist`; only the Debug configuration defines it (`INFOPLIST_PREPROCESSOR_DEFINITIONS` in `project.pbxproj`), so the Release build has neither (built and checked with `plutil`). |
| 2.5.2 Self-contained, no downloaded code changing features | No new features shipped outside review | meets with care | The app loads floortest.app (`mobile/capacitor.config.ts`, `server.url`). Website changes reach the app without review; keep new app-only features in reviewed builds. |
| 3.1.1 In-app purchase | Digital features unlocked only through Apple IAP; restore mechanism | **gap** | Owner 15 Nov: Apple in-app purchase with Restore Purchases (StoreKit 2 `AppStore.sync()` / `Transaction.currentEntitlements`, re-checked on the server). The app sells Pro and Team, monthly and yearly; web checkout (Paddle) and its links are hidden inside the app only; plans bought on the web still show and work. Plan agreed with Backend (store_entitlements, JWS verified to Apple Root CA G3, `/api/v1/billing/apple/*`, webhook); not built yet. Today the plans page still links to web checkout in the app: `src/app/dashboard/plans/PlanCards.tsx:181` → `src/app/dashboard/checkout/page.tsx`. |
| 3.1.2 Subscriptions | Auto-renewing subscriptions with clear terms | gap | Four App Store subscriptions (Pro and Team, monthly and yearly; seats stay on the web), products set up by the owner in App Store Connect. The paywall must say exactly what each price includes. Not built yet. |
| 3.1.3(b) Multiplatform services | Web purchases may unlock the app, without in-app calls to buy elsewhere | gap | Web subscribers keep their plan in the app. Met once the app hides Paddle checkout and its links (part of the 3.1.1 work); the app itself sells through IAP, it does not hide plans. |
| 4.2 Minimum functionality | More than a repackaged website | **risk** | Native parts built: background audio and lock-screen controls (`Info.plist:66`), share extension into Send (`mobile/ios/App/App/ShareInboxPlugin.swift`), offline crate (`mobile/ios/App/App/OfflineCratePlugin.swift`), haptics and native pull to refresh (`src/components/usePullToRefresh.ts:67`), app-only behaviour (`src/components/NativeApp.tsx`), own offline screen (`mobile/www/index.html`). The app is still the website at its core; push notifications (planned) would strengthen the case. Name these features in the review notes. |
| 4.8 Login services | Third-party login needs an equivalent private option (e.g. Sign in with Apple) | **meets** (once the app is rebuilt) | Owner 15 Nov: Google sign-in is hidden inside the app and stays on the website. The app adds `FloorTestApp` to its user agent (`mobile/capacitor.config.ts`, `appendUserAgent`); `src/lib/in-app.ts` reads it and the log-in and sign-up pages (`src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`) drop the Google button. Email code, password and passkeys (website) stay. Builds made before this change still show Google until rebuilt. |
| 5.1.1(i) Privacy policy | Link in App Store Connect and inside the app | meets in app; owner for listing | In-app link: `src/app/dashboard/account/page.tsx:217`; policy at `/privacy`. App Store Connect field: owner. Policy wording is the lawyer's. |
| 5.1.1(ii) Consent for data collection | Consent before collecting usage data; easy withdrawal | meets | Analytics and crash reports only after Accept on the cookie banner (`src/components/ConsentBanner.tsx`); "Cookie settings" reopens it. |
| 5.1.1(iii)/(iv) Data minimisation, permissions | Ask only for what the app needs | meets | No camera, microphone, photos, contacts or location usage strings in `Info.plist`; files come through the system share sheet and picker. |
| 5.1.1(v) Account sign-in and deletion | Account deletion inside the app | meets | Settings → Account → Delete account: `src/app/dashboard/settings/account/page.tsx:27`, action `src/app/dashboard/actions/settings.ts:188`. Sign-in is needed because the app is a private inbox (stated in the listing's review notes). |
| 5.1.2 Data use, tracking (ATT) | No tracking without App Tracking Transparency | meets | No IDFA, no ad SDKs, no `NSUserTrackingUsageDescription`. **Check:** the privacy label draft calls analytics "our own, first-party"; the web uses Vercel Analytics and Sentry after consent, so the label should list them as third-party analytics and crash data if the app shows the banner. |
| 5.1.1 / 5.1.2 Privacy manifest | Apps declare required-reason APIs in PrivacyInfo.xcprivacy; manifest and privacy labels agree | meets (once built) | `mobile/ios/App/App/PrivacyInfo.xcprivacy`: no tracking, UserDefaults CA92.1 (`SceneDelegate.swift:31`, share ids), file timestamps C617.1 (`ShareInboxPlugin.swift:17,20` app group inbox; `OfflineCratePlugin.swift:136` own container). `mobile/ios/App/ShareExtension/PrivacyInfo.xcprivacy`: no required-reason APIs. Both in each target's Copy Bundle Resources. Collected data types listed: linked, app functionality: email, name, user ID, audio, other user content; not linked: crash data (Sentry), performance data (`/api/tap-speed`), product interaction for analytics (Vercel Web Analytics, after Accept). None for tracking. The App Store Connect privacy labels (owner) must say the same; recheck both when a native plugin, payment (IAP adds purchase history) or new data is added. |
| 5.2 Intellectual property | Rights holders can complain; no infringing content | meets | Notice and takedown: `src/app/takedown/page.tsx`; content rules `src/app/content-rules/page.tsx`. |
| Age rating | Questionnaire in App Store Connect | owner | Terms say 18+ (`src/app/terms/page.tsx:24`); the listing draft suggests 12+ or 18+. Owner to pick; 18+ matches the terms. |

## Owner steps
- Enrol in the Apple Developer Program (company, D-U-N-S) and create the App Store Connect record (`app.floortest`).
- Create the review demo account on floortest.app with sample tracks, and put it in the review notes.
- Set up the subscription products in App Store Connect once in-app purchase is built.
- Answer the age rating and the privacy label; confirm crash and analytics rows.
- Lawyer: privacy policy wording (open items in `docs/legal-review.md`).

## Build steps (each on its own branch, then the Desk)
1. In-app purchase with StoreKit, Restore Purchases on the plans page and in Settings, server receipt checks; hide
   web checkout and pricing links inside the app.
2. Sign in with Apple, or Google sign-in hidden in the app.
3. ~~Report button on a track in the desk.~~ Done, see 1.2.
4. ~~Release build: drop `localhost` and local networking from `Info.plist`.~~ Done: Debug only, see 2.5.
