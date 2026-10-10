# 06 · Implementation plan

**The one to-do list.** What gets built, in what order. Older lists (`CLAUDE_NEXT_WORK.md`, `HANDOFF.md`, `docs/beta-launch-plan.md` checklists) are history; new work goes here. Ship something → tick it and move it to Done in the same commit.

## Now: beta (invite-only, site gated)
Core product is live: sending, review, collections, Prepare/downloads, plans by request, Google sign-in, ops with roles. Remaining beta work:

| # | Item | Who | Status |
|---|---|---|---|
| B1 | Google brand verification: paused until launch (site stays private). Domain already verified. To resubmit: make legal pages public again + a short description on the home/gate page, then "I have fixed the issues" | Owner + dev | at launch |
| B2 | DNS update to Vercel's new addresses (saved 9 Oct) → Refresh in Vercel | Owner | check |
| B3 | Strix security test against local/preview | Owner + dev | parked, needs AI key |
| B4 | Folder cover follow-up: move cover to the next track if the first is deleted | Dev | optional |
| B5 | Collection brief consistent in all 6 places (card done) | Dev | open |

## Mobile app (picked back up 9 Oct · planning)
Plan + tappable prototype: claude.ai/artifact/5BVVpA3Zn9AxH71ut9hGFr (private), kept in step with these docs.
- **Payments (decided 9 Oct):** web via Paddle, and in the app via Apple in-app purchase / Google Play Billing only (store rules). One plan per account from either source; no links to web payment inside the app; web subscribers see "managed on the website"; Restore purchases; server verifies purchases with Apple/Google and follows their renewal, cancellation and refund messages.
- Owner: enrol Apple Developer ($99/yr, company + D-U-N-S) and Google Play ($25).
- Foundations: ✅ `/api/v1` core (sign-in, refresh, sign-out, me, queue, keep/pass, audio) built 9 Oct; ✅ 10 Oct: receivers, sends (+ upload, complete), collections, Prepare, all with e2e tests. Still to add: push registration (with the push service). After Vercel Pro: rest of (never database or storage keys on the phone), Sign in with Apple (required now that Google sign-in is live), push service, server-made audio previews.
- ✅ 10 Oct: Share to FloorTest (iOS share extension → Send page with the file in the form), tried in the simulator from Files. Store listing draft: `mobile/store-listing.md`.
- ✅ 10 Oct: Android app (`mobile/android`) running on the Pixel 9 emulator: desk, sign-in, dark bars, icon and splash, Back goes back a page, Share to FloorTest, background audio with a notification / lock-screen player (play/pause, next, previous).
- ✅ 10 Oct: offline kept tracks on iPhone and Android (Prepare → Save for offline; offline screen plays them; wiped on sign-out / other account / 30 days).
- Next (free): artwork on the Android notification player.
- ✅ 9 Oct: app polish: native pull-to-refresh, dark edges (no white flashes), back-swipe, own offline screen with Try again (auto-retries when back online), no long-press pop-ups or stray text selection outside fields (app only), reopening returns to where you were (within a day).
- ✅ 9 Oct: background audio (plays with the screen locked), lock-screen next/previous + artwork, swipe-to-keep with live stamp and haptics.
- ✅ 9 Oct: Capacitor iOS shell prototype (`mobile/`) running on the iPhone simulator: opens on the desk/sign-in, safe-area fixed, FloorTest icon and splash.
- Build (~4 weeks):  background player + lock screen, push, share-to-FloorTest, swipe review, tabs Floor · Queue · Collections · Prepare. Then test + store review (~2 weeks).

## Before public launch (in order)
1. **Paid infrastructure:** Vercel Pro, Neon Launch, paid UptimeRobot, Resend upgrade; `ALERT_WEBHOOK_URL`. Delete old Supabase (from 13 Oct).
2. **Vercel Firewall rate-limit rule** on `/api/*` and auth pages (needs Pro).
3. **Audio previews:** server-side ffmpeg → 256 kbps AAC preview after upload; desk plays preview, download stays original; nightly retry + backfill. (Needs Pro.)
4. **Payments:** Paddle (monthly + yearly), checkout replaces the request form when switch `billing` is on.
5. **Legal:** lawyer redlines (incl. Q23 and the Google sign-in privacy section), remove "draft" banners, operator details, registrations (Ghana DPC, DMCA agent, UK/EU rep if advised).
6. **Email domain:** Google Workspace → legal/reply-to addresses; DMARC to quarantine after two clean weeks.
7. **Accessibility pass** with a real screen reader + INP on a real phone.
8. **Antivirus scanning** of uploads.
9. **Launch switches:** remove `SITE_PASSWORD`, turn on `open_signup` (Google sign-up then works without a code).

## After launch
- Colleague sharing (switch `sharing`, after lawyer wording).
- Stems as a paid feature.
- Rekordbox how-to video, footer legal placement, mobile footer redesign.

## Done (recent)
- 10 Oct: batch actions in the List view (keep, not for me, needs review, move, download, delete) + e2e test.
- 10 Oct: offline kept tracks (Save for offline in Prepare; offline screen player) on both apps.
- 10 Oct: Android app prototype (share, back button, background audio with notification player, icon/splash).
- 10 Oct: app API v1 rest (receivers, sends + upload, collections, Prepare) on shared send checks; Share to FloorTest on iPhone.
- 9 Oct: mobile app API v1 core (app sessions in `sessions`, rotating refresh, signed 15-min access tokens) + e2e tests.
- 9 Oct: human check (Cloudflare) on log-in, email codes and ops sign-in after 3 wrong tries.
- 9 Oct: end-to-end tests (Playwright): sign-up → send → keep → download, plus security guards. Floor greets by first name.
- 9 Oct: on-page editing extended to Pricing, Sign-up/Log-in, public link and receipts.
- 9 Oct: edit the home page on the page itself (text, lists, image, drag/hide sections) from ops → Site content.
- 9 Oct: rate-limit audit; sign-up no longer reveals accounts; platform email cap. Button system; consistent names; one set of download buttons; Prepare redesign; Send folds after 10 days; Floor day-mode redesign; Google sign-in + sign-up + safety; track artwork (Team), incl. folders; legal pages public for Google review.
- 8 Oct: image optimiser, foreign-key indexes, ops roles, plan requests, discounts, yearly prices, collection delete.
