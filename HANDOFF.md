# Where things stand (27 Sep 2026)

**Live:** https://floortest.vercel.app (Vercel project `floortest`, London). Custom domain `floortest.imullar.com` is added and DNS points at Vercel (A 76.76.21.21); `APP_URL` already uses it. Old DNS caches may serve the previous host for a few hours after 27 Sep ~00:50 UTC.

**Backends:** Supabase project `floortest` (ref `crghwblbuodxhsfgeppw`, FloorTest org, London). Cloudflare R2 bucket `floortest-audio` (CORS allows both domains). Resend for email. Secrets live only in Vercel env vars.

**Deploy:** `npx vercel deploy --prod` from this folder (already linked). Migrations run automatically on first request.

**Open items**
- Resend: verify `floortest.imullar.com` (DNS at TMDHosting), then set `MAIL_FROM="FloorTest <hello@floortest.imullar.com>"`. Until then emails only reach the Resend account owner.
- `SUPPORT_EMAIL` not set (contact form goes nowhere).
- Optional: redirect `floortest.vercel.app` → `floortest.imullar.com` once the domain is reachable everywhere.
- Old Supabase project in the FloorTest org ("maxwelladjavon@gmail.com's Project") holds an earlier prototype plus an empty `schema_migrations` table from a failed connection: pause/delete when ready.
- Terms and Privacy are drafts: review with the legal plugin, then a lawyer.
- Next: use the marketing, brand-voice and legal plugins on the home page copy, emails and legal pages.
