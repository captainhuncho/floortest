# Where things stand (27 Sep 2026)

**Live:** https://floortest.imullar.com (Vercel project `floortest`, London; DNS A record 76.76.21.21 at TMDHosting). `floortest.vercel.app` redirects there, except `/api/*`.

**Admin:** `/admin`, for `ADMIN_EMAILS` only, and actions need two-factor on.

**Backends:** Supabase project `floortest` (ref `crghwblbuodxhsfgeppw`, FloorTest org, London). Cloudflare R2 bucket `floortest-audio` (CORS allows both domains). Resend for email. Secrets live only in Vercel env vars.

**Deploy:** `npx vercel deploy --prod` from this folder (already linked). Migrations run automatically on first request.

**Open items**
- Resend: verify `floortest.imullar.com` (DNS at TMDHosting), then set `MAIL_FROM="FloorTest <hello@floortest.imullar.com>"`. Until then emails only reach the Resend account owner.
- `SUPPORT_EMAIL` not set (contact form goes nowhere).
- Virus scanning of uploads (ClamAV on a small server, ~$5–6/mo): parked.
- Old Supabase project in the FloorTest org ("maxwelladjavon@gmail.com's Project") holds an earlier prototype plus an empty `schema_migrations` table from a failed connection: pause/delete when ready.
- Terms and Privacy are drafts: review with the legal plugin, then a lawyer.
- Next: use the marketing, brand-voice and legal plugins on the home page copy, emails and legal pages.

## On standby
- Virus scanning of uploads (paid, ~$5–6/mo).
- Lawyer review of Terms and Privacy (drafts updated 27 Sep 2026).

## Codex review for Claude (1 Oct 2026)

No application code was changed during this review. At the time of review, `mobile-next` and `origin/mobile-next` were both at `156da8f`; the Turnstile and unsubscribe work below was still uncommitted.

### Fix before enabling colleague sharing

- Keep `SHARING_LIVE=false` until these two items are resolved.
- Do not keep a Vercel function alive with the two-minute `setTimeout` in `src/app/t/[token]/actions.ts`. There is no reliably safe waiting period inside a serverless invocation. Keep the two-minute product experience, but store an explicit `final_at` timestamp and return immediately. Finalise due consent with a scheduled job/queue, plus lazy finalisation when the receipt, dashboard or share action is opened. A job running every minute makes consent final in roughly 2–3 minutes.
- Make cancellation and finalisation atomic. At the deadline, `finalizeConsent` can currently set `tracks.share_ok=1` while `cancelShareConsent` marks the request cancelled. Use a transaction or conditional update so exactly one transition wins, and only send the receiver email after the final transition has been claimed.
- Add tests for: cancellation just before the deadline; cancellation/finalisation running concurrently; repeated finalisation sending one email; and a cancelled request never creating or serving a share link.

### Admin UX follow-ups

- Clear the admin menu search when a result is selected or when the pathname changes; it currently stays in search mode after navigation.
- Give the mobile admin navigation an active-page state. The long horizontal list will become harder to understand as more admin pages are added; a compact section menu plus page title would scale better.
- Restore a keyboard-visible `Skip to content` link targeting `#main`.

### Turnstile and unsubscribe work

- The current Turnstile wiring covers signup, waitlist, contact and anonymous submissions. Confirm that both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set together in Preview and Production before expecting enforcement.
- Verification currently fails open when Cloudflare times out. That is a reasonable beta availability choice because rate limits remain in place, but log/monitor verification failures and reconsider fail-closed behavior if abuse appears.
- Unsubscribe tokens are permanent and tied to the account ID. Confirm that this is intentional after email/ownership changes; otherwise include a preference-token version or email hash so old mailbox links can be invalidated.
- Rotating `APP_SECRET` invalidates every existing unsubscribe link. Treat secret rotation as an operational event and document the effect.
- The unsubscribe queries correctly respect `notify_submissions`, `notify_alerts` and `notify_product`; keep mandatory security, sign-in and transactional messages outside these categories.

### Merge and release checks

- TypeScript passed with `npx tsc --noEmit --incremental false` on 1 Oct 2026.
- Run the complete test suite and production build in an unrestricted checkout before merging; the review sandbox could not create the local `tsx` socket or `.next` trace files.
- Commit the Turnstile/unsubscribe work as a separate, reviewable commit. Verify a Preview deployment before promoting it to production.
- Smoke-test: anonymous upload, account upload, signup, waitlist, contact form, each unsubscribe category, notification preference re-enable, admin mobile navigation, and day/night/system appearance.
