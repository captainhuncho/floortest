# 06 · Implementation plan

**The one to-do list.** What gets built, in what order. Older lists (`CLAUDE_NEXT_WORK.md`, `HANDOFF.md`, `docs/beta-launch-plan.md` checklists) are history; new work goes here. Ship something → tick it and move it to Done in the same commit.

## Now: beta (invite-only, site gated)
Core product is live: sending, review, collections, Prepare/downloads, plans by request, Google sign-in, ops with roles. Remaining beta work:

| # | Item | Who | Status |
|---|---|---|---|
| B1 | Google brand verification: paused until launch (site stays private). Domain already verified. To resubmit: make legal pages public again + a short description on the home/gate page, then "I have fixed the issues" | Owner + dev | at launch |
| B2 | DNS update to Vercel's new addresses (saved 9 Oct) → Refresh in Vercel | Owner | check |
| B3 | Strix security test against local/preview | Owner + dev | parked, needs AI key |

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

## In progress: audio bucket to Europe (started 11 Oct)
Audio sits in `floortest-audio`, created in Eastern North America (ENAM), while the server, database and users are London/West Africa side; play start measured 0.9–1.5 s from Ghana. Steps: ✅ 1 `floortest-audio-eu` created (WEUR, Standard) · ✅ 2 CORS copied · ✅ 3 live token (R2 Account Token 2) already covers all buckets; preview tokens kept on the preview bucket only · ⬜ 4 R2 Data Migration (S3-compatible source: bucket `floortest-audio`, endpoint `https://<account>.r2.cloudflarestorage.com/floortest-audio`, S3 Access Key ID + Secret Access Key of a read token, not the token value) → destination `floortest-audio-eu` · ⬜ 5 Vercel `S3_BUCKET` = `floortest-audio-eu`, redeploy · ⬜ 6 run the migration again (skip existing) · ⬜ 7 verify live (play, upload, timing), update docs · ⬜ 8 owner deletes the old bucket after a week. Fallback if Data Migration won't connect: a one-off ops copy job using the app's own access.

## Controlled collection sharing (decided 11 Oct · building)
Owner keeps control; sharing never makes music public or moves ownership. Behind switch `sharing` until the lawyer approves the Terms.
- **Two ways in, nothing else:** the owner uploads into their own collections; everyone else (artists, labels, teammates, account holders) sends through the submission link (`floortest.app/<handle>`). Reviewers never get upload rights.
- **Share links are separate from the submission link:** each has its own random ID (`/c/<random>`, stored hashed, shown only when made or reset); several per collection, each with its own permission, expiry, recipients and activity; reset or revoke ends that link's sessions at once and leaves the others.
- **Verified named recipients only** (no open links): the owner lists emails, a company domain (`@label.com`) or FloorTest usernames; opening a link needs an email code (signed-in account holders with a confirmed email go straight in; the collection then shows under "Shared with you"). Account security carries over (sign out everywhere, suspension, removal end access).
- **Request to join** (per link, on by default): someone not listed verifies their email, sends name + note; the owner approves (Listen or Listen + Download, never more than the link, with expiry) or declines; requests show which link they came through. Limits: one waiting request per email per link, 2 requests a day per email, 10 an hour per connection, 30-day cooldown after a decline (Block / Allow again), a link pauses requests at 20 waiting and warns it may have leaked, request emails grouped at most hourly. Messages never reveal the collection.
- **Permissions:** Listen · Listen + Download · Review Together (account holders, invite only: comment, shortlist, and Keep / Not for me only if the owner allows; no uploads, replacing or deleting). Recipient invitations off.
- **Sender permission:** the updated Terms plus one plain line on the send form ("The receiver can share what you send privately with people they invite to listen. They can't publish it."); only tracks sent under the new Terms version can be shared; earlier tracks keep today's per-track artist consent.
- **Phases:** 1) ✅ Review Together (comments, shortlist, owner-allowed Keep / Not for me, no uploads; 11 Oct), ✅ owner uploads (11 Oct), ✅ hashed share codes (11 Oct) · 2) ✅ share links with their own IDs, verified recipients, request to join, expiry/reset/revoke, access notice (11 Oct; e2e `sharing.spec.ts`) · 3) ✅ "Shared with you" for account recipients, per-recipient activity, security notifications, single-recipient removal (11 Oct) · 4) Terms, Privacy, send-form line (lawyer), then switch on. Brief sent 11 Oct: `docs/legal/sharing-brief-2026-10-11.md` (also covers live Review Together). Our side ✅ (11 Oct): tracks record the sharing wording (`share_terms`), only those are shared; share-link records deleted on proposed periods; new Terms / Privacy / Cookies wording ready behind the switch (`src/lib/legal-sharing.ts`) and on the send form; Privacy links on the recipient page; senders can stop private sharing from the receipt. **At switch-on:** paste the lawyer's redlines into `legal-sharing.ts`, set its `updated` and `SHARING_TERMS_VERSION`, adjust `LINK_KEEP_DAYS`, and decide what happens to the old per-track colleague sharing (`src/lib/share.ts`), which the same switch turns on.

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
- 11 Oct: sharing, our side of phase 4: wording version per track, retention and account-deletion clean-up, data requests, legal wording behind the switch, send-form line, Privacy links and new notice on share pages, sender's Stop private sharing.
- 11 Oct: sharing phase 3 (behind switch `sharing`): Shared with you for accounts (`/c/a.<id>`, survives reset, ends at sign-out, sign-in returns there), per-person activity, removal with confirmation, owner bell + leak warnings, accounts emailed when added; colleague-share sign-in return fixed (it checked `/s/`, the page is `/share/`).
- 11 Oct: sharing phase 2 (behind switch `sharing`): collection share links with their own IDs, named verified recipients, email codes, access notice, request to join with limits, reset/revoke, gated listen and download.
- 11 Oct: sharing phase 1: Review Together, owner uploads, share codes stored as fingerprints.
- 10 Oct: review screens decongested (team review: designer, DJ/A&R, engineer): one meta line, decision tags, one Details section, no duplicate stats or status chips, collection filter menu, shortcuts behind "?", 1–4 jump keys, swipe hint until first swipe, panel lookups in parallel.
- 10 Oct: review fixes for the reopen work: re-routing closed links is opt-in (Settings → Receiving) and emails the receiver; reopen emails queued (≤50 per click, rest nightly, failures retried) with an "ignore if you didn't ask" line; Floor greeting restored, first-listen time in words.
- 10 Oct: B4 folder cover stays with the folder when its track is deleted; B5 one collection brief everywhere (`src/lib/brief.ts`).
- 10 Oct: final design pass: one page-title size on every dashboard page, one eyebrow style in two tones, radii by role everywhere (no ad-hoc pixel values), one pop shadow, the onboarding tick drawn with theme ink; the Floor chart component removed.
- 10 Oct: sign-in and sign-up pass: one centred column (side panel gone), one heading size, inline one-at-a-time validation in the shared form, professional name moved to Profile, numeric keyboards for codes, calmer signed-out page, fresh desks see their link first.
- 10 Oct: Floor pass: attention first (waiting count as the heading, one button, link problems as the only banner), Up next, kept-for-set line, one line of weekly facts, link and sending last; stat tiles, 14-day chart, genre mix, activity and contacts cards removed from the Floor (their pages remain).
- 10 Oct: tracking pass: receipt leads with the strongest event and its time, "For you" only when there is something to do, bright/quiet timeline, meanings and details folded away; sender history and dashboard Send rows status-first with one dot instead of chips.
- 10 Oct: submission flow pass: one look for the send form (public link and dashboard), no cards around sections, title/artist read from the file, message and artwork behind "Add…" links, inline one-at-a-time validation (no browser bubbles), upload progress in place of the full-screen takeover, success with the three receipt steps; brief on the link page as text; hand-off bullets only before a file is picked.
- 10 Oct: design foundation: tokens for radii, type roles, shadows and easing; `panel`, `eyebrow`, `meta`, `dialog-box`, `scrim` utilities; dashboard cards, eyebrows, pop shadows and the two native dialogs moved onto them (same look). Design system written into 04.
- 10 Oct: UI polish pass: Account band no longer overlaps at laptop widths; Prepare titles keep room on narrower desktops; verify-email banner one line; Day mode fixed where white was hard-coded (Kept pills, play buttons via `play-dot`, Keep/Reply buttons, selected chips, Receiving badge).
- 10 Oct: product review fixes: links re-route themselves off closed collections nightly + "Email me when it reopens" on closed/full/paused links (e2e test); plan cards derived from real plan capabilities, no held features, no offer while billing is off, "active tracks" defined; counts labelled by window (Received/Kept this week, Decided, Tracks sent); one date format; sender form keeps profiles on the device and groups mix/release/AI; phones get the player first in the queue and Up next before Send music; "Mix status" label; Contacts named Contacts; tooltips on list actions; bell grouped by day.
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
