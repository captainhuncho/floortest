# FloorTest

The receiving desk for unreleased music. A receiver shares one permanent link, hears incoming music fast, makes a quick decision and responds. A sender uploads an original file without an account and knows what happened next.

## Run it

```bash
npm install
npm run seed   # optional: demo receiver with two callouts and six tracks
npm run dev
```

Open http://localhost:3000. The demo login is at the top of `scripts/seed.mjs`. The demo receiver link is `/maxwell`.

Requires Node 22.5+ (uses the built-in `node:sqlite`, so there are no native dependencies).

## Receiver loop

1. Open **Submissions**. The oldest track that needs review is already loaded.
2. Press play (Space).
3. **Keep** (K), **Could be better** (X) or **Reply** (R). Keep and Could be better move to the next track and keep playing.
4. Undo the last decision any time with U.
5. Kept tracks → **Prepare for set** downloads the originals with a `rekordbox.xml` and M3U8 playlist.

Navigation: Submissions (Queue or List layout) · Collections · Contacts · Activity. Link, plan, storage and the email log live in the profile menu.

## Sender loop

1. Open the receiver's link and choose a WAV or MP3 (the only thing asked up front).
2. Title and artist are read from ID3 / WAV INFO tags or an `Artist - Title` filename. Duration, format, size, waveform and BPM come from the file.
3. Add name and email (remembered on the device), with an optional message and release status.
4. Get a private receipt and emails for each signal.

### Public page styles

Receivers choose in **Link, plan & storage → Public page**. Preview either with `/<handle>?style=classic` or `?style=stage`.

- **Classic**: minimal and file-first.
- **Stage**: photo-led, with the receiver's cover photo, role line, the callout brief (what's wanted, BPM range, deadline, vibe note, set per collection), demo-status chips and a review step before sending. Warns, without blocking, when the detected BPM is outside the brief.

## Signal definitions

Defined once in `src/lib/plans.ts` and shown to both sides.

| Signal | Meaning | Sender sees it |
| --- | --- | --- |
| Listened | Played ≥ 30 s, or ≥ 25 % of a shorter track (seeks excluded, re-checked on the server) | Yes |
| Downloaded | The original file finished transferring (aborted downloads don't count) | Yes |
| Replied | Receiver sent a message | Yes |
| Kept / Could be better | Explicit receiver decision | No, private |

## Trust & intake controls

- Structural audio validation (WAV RIFF/fmt/data, MPEG frame sync), which rejects disguised executables, archives and truncated files. **Not** a malware scan.
- 250 MB limit, per-connection (10/hour) and per-email (5/day) rate limits per link.
- Sender email verification link in the delivery email; receivers see Verified / Unverified.
- Block a sender from their contact page; manage blocked senders in settings.
- Closing date per collection; the public page shows "closed" and uploads are refused.
- Retention: undecided tracks are deleted after 90 days, passed tracks 30 days after the pass, kept tracks never (until the receiver deletes them). Senders are told the policy up front.

## Account menu (top right)

- **Search** (⌘K): tracks, artists and contacts.
- **Bell**: new submissions, auto-deletions and link alerts (closed, closing soon, full).
- **Profile**: plan usage and upgrade, a **Pause submissions** switch (optional message shown on your link and an auto-reopen date; uploads are refused while paused), a **QR code** of your link (PNG/SVG download), profile, **Notifications** (instant emails with quiet hours, a daily digest, or off, plus a "link paused" alert), **Referrals** (invite link; both sides get 10 extra song slots when the invitee receives their first track), submission link, activity, emails to senders.
- **Footer**: Contact us (form, sent to `SUPPORT_EMAIL`), Trust & Security, Terms and Privacy (built-in drafts, replaced by `TERMS_URL` / `PRIVACY_URL`), third-party licenses. Shop and Instagram appear once `SHOP_URL` / `INSTAGRAM_URL` are set.

Digests need an hourly call to `/api/cron/digest` with `Authorization: Bearer $CRON_SECRET` (e.g. a Vercel Cron). Users can also send one on demand.

## Configuration

Copy `.env.example` to `.env.local`.

- `APP_URL`: public URL used in emails and receipts.
- `DATA_DIR`: SQLite DB and audio files (default `./data`).
- `RESEND_API_KEY` / `MAIL_FROM`: deliver emails for real. Without them every email is still logged under **Emails sent to senders**.

## Not built yet

From the audit's P1/P2 list:

- Antivirus scanning (ClamAV or a provider) before public launch.
- Payments (plan switching is free for the beta).
- Notification digest and quiet hours, saved reply templates.
- Filtering by BPM or key, key detection, energy.
- Set-test notes, duplicate/version detection, team workflows.
- Object storage (S3/R2) and a hosted database for multi-instance deploys.
- Beta success metrics (time to first decision, decision rate, and so on). Events are already recorded to compute them.
