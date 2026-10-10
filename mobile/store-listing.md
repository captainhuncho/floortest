# FloorTest: App Store and Google Play listing (draft)

Ready to paste once the developer accounts exist. Items marked **(confirm)** need a decision from the owner.

## Basics
- **Name:** FloorTest
- **Subtitle (App Store, 30 chars):** Unreleased music, sorted
- **Short description (Play, 80 chars):** Receive unreleased music from producers, review it fast and take it to your set.
- **Category:** Music (secondary: Productivity)
- **Bundle / package id:** app.floortest (share extension: app.floortest.share)
- **Age rating:** 12+ / Teen **(confirm)**. Senders upload their own music and messages; there's no public feed, chat or browsing of strangers. FloorTest's terms require users to be 18+, so the App Store "18+ only" self-declaration may be the safer answer.
- **Support URL:** https://floortest.app/contact · **Privacy policy:** https://floortest.app/privacy · **Marketing URL:** https://floortest.app
- **Price:** Free. Paid plans in the app via Apple In-App Purchase / Google Play Billing only (see docs/06-plan.md, Payments).

## Description
FloorTest is the receiving desk for unreleased music.

Share one link. Producers, labels and artists send their tracks to it: WAV or MP3, with the details you ask for. Everything lands in one Review Queue instead of your inbox, DMs and download links.

- Review fast: play a track, then swipe to keep it or pass. Senders never see your decision.
- Listen anywhere: tracks keep playing with your screen locked, with lock-screen controls.
- Prepare for your set: everything you keep is ready to download as a crate with a Rekordbox playlist, or saved on your phone to play with no signal.
- Callouts: open a collection for a brief, a genre or a deadline, and close it when you're full.
- Send your own music: share a WAV or MP3 from Files, Dropbox or WeTransfer straight into FloorTest and send it to another FloorTest link.
- Senders get a receipt and see when their track was delivered, listened to, downloaded and replied to.

Built for DJs, A&Rs, labels and curators who get sent more music than they can open.

## Keywords (App Store, 100 chars)
dj,demo,promo,unreleased,music,a&r,label,submissions,rekordbox,tracks,producer,review,crate

## What's new (first release)
The first FloorTest app: review your queue, keep or pass with a swipe, listen with the screen locked, and share tracks into FloorTest to send them.

## App Review notes (Apple)
- Sign-in is required: FloorTest is an inbox for music sent to the user's own link. A demo account will be supplied for review **(create one on floortest.app before submitting; never reuse a real account)**.
- Background audio is used to keep playing tracks under review with the screen locked.
- The share extension accepts WAV and MP3 files and opens the app's Send page; nothing is uploaded until the user presses Send.
- Sign in with Apple is offered next to Google sign-in (to be built before submission).

## App privacy (App Store "nutrition label") / Play Data safety
Nothing is used for tracking, nothing is sold, and there are no ads or third-party analytics SDKs in the app.

| Data | Collected | Linked to the user | Purpose |
|---|---|---|---|
| Name, email | Yes | Yes | Account, app functionality |
| User content: audio files, artwork, messages | Yes | Yes | App functionality (sending and receiving music) |
| User ID | Yes | Yes | App functionality |
| Product interaction (which features are used) | Yes | Yes | Analytics (our own, first-party), product improvement |
| Purchases | Yes, once in-app purchases ship | Yes | App functionality |
| Crash data | No (none in the app today) **(confirm if a crash reporter is added)** | n/a | n/a |
| Location, contacts, photos, health, browsing history | No | n/a | n/a |

Play Data safety also asks:
- Data is encrypted in transit: **yes** (HTTPS only).
- Users can ask for their data to be deleted: **yes** (Settings → Delete account; see docs/05-data.md, Retention and deletion).

## Screenshots to capture (6.9" and 6.5" iPhone; Play phone)
1. Floor: "Good morning, Maxwell. 2 tracks are waiting for you."
2. Review Queue mid-swipe with the KEEP stamp
3. Track open with waveform and the sender's note
4. Prepare for set with kept tracks and Download crate
5. Lock screen playing a track
6. Share sheet with FloorTest → Send page with the file in the form

Use the demo data only (seed accounts), never real senders' names or tracks.
