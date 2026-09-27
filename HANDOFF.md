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

## On standby (next batch, agreed 27 Sep 2026)
- Smart filters in the Review Queue: BPM range, genre, key, verified senders only.
- Duplicate detection: same file twice, or a sender re-sending a track.
- Mobile listening: phone-first queue with swipe to keep / could be better.
- Sender history page: every track a sender has sent, via a magic link to their email.
- Follow-up nudges: remind the receiver once if a track sits unheard for 14 days.
- Weekly beta digest email to the admin (the Metrics numbers).
- Terms and Privacy: finalize with the legal plugin, then a lawyer.
- Virus scanning of uploads (paid, ~$5–6/mo).
