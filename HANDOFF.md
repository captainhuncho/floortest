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
