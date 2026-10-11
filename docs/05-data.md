# 05 · Data: where it lives and who can see it

Table-by-table detail, query rules, migrations and backups: `docs/DATABASE.md`. This file answers **where** and **who**. Add a table, a column holding personal data, or a permission → update this file in the same commit.

## Where data lives

| Data | Store | Region | Kept |
|---|---|---|---|
| Accounts, tracks' details, decisions, messages, logs | Postgres (Neon) | London | until deleted (see retention) |
| Audio, stems, covers, collection art, track artwork | Cloudflare R2, private bucket | EU/US edge | with its track/account |
| Outgoing email copies | `outbox` table + Resend | Resend (US) | per Resend retention |
| Error reports | Sentry | US | 90 days |
| Visit stats | Vercel Analytics (no cookies) | US | per Vercel |

Files are never public: the app hands out short-lived signed links after checking who's asking.

## Main tables by owner (77 migrations; full list in `src/lib/db/migrations.ts`)

| Group | Tables | Personal data |
|---|---|---|
| Receivers | `users`, `sessions`, `login_codes`, `password_resets`, `handle_history`, `account_log`, `account_actions` | name, email, password hash, two-factor secret (encrypted), Google account id, IPs in logs |
| Senders | `senders`, `sender_codes`, `uploads`, `releases` | name, email, profile links |
| Music | `tracks`, `stems`, `collections` (`team_can_decide`), `collection_members`, `track_votes`, `track_comments`, `track_shortlist`, `events` | file keys, titles, messages, listening/decision history |
| Sharing (held) | `track_shares` (only a SHA-256 fingerprint of each link's secret, `token_hash`; the link is shown once when made, and making a new one retires the old), `share_access`, `share_requests` | who listened/downloaded |
| Collection share links (held) | `collection_links` (secret kept only as a fingerprint), `link_recipients`, `link_sessions` (fingerprints, tied to the link's generation), `link_codes` (hashed, 10 min), `link_requests`, `link_events` (incl. `code_unlisted`: addresses that asked for a code but aren't on the list, for the owner's leak warning; not shown in activity) | recipient emails, names and notes on requests (no IPs stored; request limits use `rate_events`), who opened/played/downloaded; the owner sees each person's visits, plays and downloads |
| Plans | `plans`, `plan_requests` | org name, link, notes |
| Growth | `waitlist`, `invites`, `newsletter_subscribers`, `contact_messages`, `reopen_alerts` ("email me when it reopens": sender email + receiver, sent rows deleted after 30 days, unanswered after a year; in data copies and erasure) | name, email, links |
| Ops | `ops_members`, `admin_sessions`, `admin_log`, `account_notes`, `partner_notes`, `incidents`, `job_runs`, `switches`, `site_content*` | staff emails, notes about users |
| Abuse/safety | `rate_events`, `platform_blocks`, `takedowns`, `protected_names`, `email_suppressions`, `storage_deletions` | IPs, emails (rate events deleted within 3 days) |

## Who can see what

| Who | Can see |
|---|---|
| Receiver | their own account, collections, tracks sent to them, senders' names/emails/links, their own logs |
| Sender | their own receipts (by private token or confirmed email), not the receiver's notes |
| Colleague (held) | only tracks shared with them, listen (download if plan allows) |
| Share-link recipient (held) | only that collection's tracks sent while it allowed sharing, after an email code (or confirmed-email sign-in) and the access notice; listen, download only if granted; account holders also by `/c/a.<id>` while signed in (that visit ends at sign-out); never other collections, senders' details or the owner's notes |
| Ops, by permission | **Customer Care**: overview, inbox, feedback, emails, user support (suspend/restore/notes), verification, partners. **Developer**: incidents, jobs, storage, speed, security, switches, metrics. **Product Lead**: metrics, feature use, feedback, announcements, site content, switches, plans (view), partners. **Sales & Marketing**: plan requests, waitlist, invites, partners, revenue, announcements, emails (view), metrics |
| Super admin only | ops team, takedowns, data requests/exports, admin log, editing plans/prices or someone's plan, deleting/erasing accounts, changing email/handle, resetting two-step, signing someone out everywhere, View as, users CSV |

Every ops page and action names its permission (`src/lib/ops-perms.ts`); the build fails if one doesn't.

The mobile app signs in as an `app` row in `sessions` (refresh token stored hashed); it holds no database or storage keys, and "sign out everywhere", password changes and suspensions end it like any browser session. Browser cookies only ever match `web` sessions. Files shared into the app wait in the app's own app-group folder on the phone until sent or removed (cleared after a day); nothing is uploaded until the sender presses Send. **Offline kept tracks** (opt-in, Prepare → Save for offline): copies of the receiver's kept tracks in the app's private storage, excluded from phone backups. The copy always matches the last sync (cleared or deleted tracks, including auto-deleted ones, leave at the next sync), is wiped on sign-out, on reaching sign-in, when another account syncs, and after 30 days without opening Prepare online. Download links are signed per track and receiver and last an hour; saving offline isn't recorded as a "Download" on the sender's receipt.

Ops reaching into the main site (on-page editing, read-only "View as") is bound to the exact ops session that started it: signing out of ops or its timeout ends it at once.

## Retention and deletion
- Undecided audio: 90 days. "Not for me": 30 days. Kept: until the receiver deletes. Artwork and stems go with their track; an EP/album cover passes to the folder's next remaining track instead (`handOverFolderCovers`), and goes when the last of them goes.
- Deleting an account removes every file and row it owns; files are queued in `storage_deletions` and retried until gone; backups age out within 30 days.
- Privacy requests (copy, erase) run from ops (super admin).
