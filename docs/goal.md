# FloorTest goal

Approved by the owner ("goal ok", 11 Nov 2026); the iPhone app added on his "goal ok" of 20 Nov 2026. Under it, small changes that serve this goal can go live without
asking (`lane:auto`, see "Standing approval" in the owner's rules); anything outside it, or anything the owner would
notice, still waits for "ship it". A new goal or a change of direction needs a fresh yes.

## What done looks like
FloorTest opens to the public: the Coming soon password is gone, anyone can sign up, and the hard launch gate in
[06-plan.md](06-plan.md) ("Before public launch") is met. On the way:
- The five-person pre-beta run (B0) is recorded and passed, then the invite-only beta runs.
- A DJ shares one link, gets a first track within 48 hours, and clears the queue: the north star, tracks decided within
  7 days of arriving, is shown in ops and moving up.
- Senders get an honest receipt (Delivered, Listened, Downloaded, Replied, Played out) and nothing more.
- Every person sees only their own desk's data (per-person database rules, B8), backups restore in a recorded drill,
  and uploads never reach a desk unscanned.

FloorTest's iPhone app passes App Review and is on the App Store, built on the existing Capacitor wrapper (`mobile/`),
alongside the web launch. On the way: music keeps playing on the lock screen, push tells a receiver when a track
arrives, the share sheet sends a file to FloorTest, plans are bought with Apple in-app purchase (through RevenueCat)
with Restore Purchases, web checkout never shows in the app, and account deletion, the privacy manifest, the listing's
privacy table and safe areas all match [app-store-review.md](app-store-review.md).

## In scope
Work on the [Road to public launch](06-plan.md) list, in its order:
- Finishing and fixing the web product: sending, receipts, the Queue and Floor, collections, Prepare and downloads,
  contacts and replies, team desks, ops.
- Bugs, copy in the brand voice ([brand-voice.md](brand-voice.md)), docs, tests, speed on cheap phones and slow
  connections, every device and both themes.
- Data safety and security work: B8, the slow-query pass, the version check on content and plans, two-step sign-in for
  owners, admins and ops, security emails and alerts, Safety's follow-ups.
- Proving it holds: restore drills, the load test, a second virus scanner, monitoring.
- Paddle checkout once the owner has the account.
- The iPhone app (`mobile/`) and the server pieces it needs: push, purchase checks (RevenueCat webhooks and its API),
  entitlements, one plan per account whatever the source.

## Out of scope for this goal
- The Android app (until the iPhone app is live), stems as a paid feature, label add-ons, audio previews, collection sharing switch-on
  (after the lawyer), US marketing.
- New features or screens nobody has asked for.
- The glass redesign and Floor options A/B (#407, #408, #419, #434): parked until the owner gives design direction.

## Always the owner's, whatever the goal
Legal wording, secrets and sign-ins, deletions, payments and spend, any widening of access (sign-in, roles, sharing,
the site password), migrations that drop or rewrite data, production and dashboard settings, new packages, App Store
Connect, RevenueCat and signing (bundle IDs, products and prices, keys, submitting to App Review), and launch day itself
(removing the password, opening sign-up).
