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
- Mobile app (authenticated `/api/v1` only, never database credentials).
- Rekordbox how-to video, footer legal placement, mobile footer redesign.

## Done (recent)
- 9 Oct: human check (Cloudflare) on log-in, email codes and ops sign-in after 3 wrong tries.
- 9 Oct: end-to-end tests (Playwright): sign-up → send → keep → download, plus security guards. Floor greets by first name.
- 9 Oct: on-page editing extended to Pricing, Sign-up/Log-in, public link and receipts.
- 9 Oct: edit the home page on the page itself (text, lists, image, drag/hide sections) from ops → Site content.
- 9 Oct: rate-limit audit; sign-up no longer reveals accounts; platform email cap. Button system; consistent names; one set of download buttons; Prepare redesign; Send folds after 10 days; Floor day-mode redesign; Google sign-in + sign-up + safety; track artwork (Team), incl. folders; legal pages public for Google review.
- 8 Oct: image optimiser, foreign-key indexes, ops roles, plan requests, discounts, yearly prices, collection delete.
