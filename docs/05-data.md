# 05 · Data: where it lives and who can see it

Table-by-table detail, query rules, migrations and backups: `docs/DATABASE.md`. This file answers **where** and **who**. Add a table, a column holding personal data, or a permission → update this file in the same commit.

## Where data lives

| Data | Store | Region | Kept |
|---|---|---|---|
| Accounts, tracks' details, decisions, messages, logs | Postgres (Neon) | London | until deleted (see retention) |
| Audio, stems, covers, collection art, track artwork | Cloudflare R2, private bucket | EU/US edge | with its track/account |
| Outgoing email copies (sign-in codes and private links stored hidden) | `outbox` table + Resend | Resend (US) | per Resend retention |
| Error reports | Sentry | US | 90 days |
| Visit stats | Vercel Analytics (no cookies) | US | per Vercel |

Files are never public: the app hands out short-lived signed links after checking who's asking.

## Main tables by owner (77 migrations; full list in `src/lib/db/migrations.ts`)

| Group | Tables | Personal data |
|---|---|---|
| Receivers | `users`, `sessions`, `login_codes`, `password_resets`, `handle_history`, `released_handles` (a deleted account's link names, reserved for a year, no account behind them), `account_log`, `account_actions` | name, email, password hash, two-factor secret (encrypted), Google account id, IPs in logs |
| Senders | `senders`, `sender_codes`, `uploads`, `releases` | name, email, profile links |
| Music | `tracks`, `stems`, `collections`, `track_comments` (team comments, signed by the person), `track_shortlist`, `events` | file keys, titles, messages, listening/decision history |
| Retired (dropped) | the 1 Oct colleague-sharing and Review Together guest tables were dropped by migration `0085_drop_retired`; what they held is recorded in `docs/retired.md` | who listened/downloaded |
| Collection share links (held) | `collection_links` (secret kept only as a fingerprint), `link_recipients`, `link_sessions` (fingerprints, tied to the link's generation), `link_codes` (hashed, 10 min), `link_requests`, `link_events` (incl. `code_unlisted`: addresses that asked for a code but aren't on the list, for the owner's leak warning; not shown in activity) | recipient emails, names and notes on requests (no IPs stored; request limits use `rate_events`), who opened/played/downloaded. Kept (nightly clean-up, `LINK_KEEP_DAYS`, pending the lawyer): codes 1 day, unknown-address notes 2 days, a link ended over a year ago with everything on it, approved or unanswered requests a year; declines and blocks while the collection exists. Account deletion removes the account from others' lists and its visits, requests and activity; data requests include share-link lists, activity and requests; the owner sees each person's visits, plays and downloads |
| Account teams (held) | `account_members` (account, person, role, and that person's own bell seen/cleared times for the desk), `account_invites` (only a fingerprint of each invite link; 7 days), `held_replies` (members' replies waiting for approval), `users.extra_seats`, `users.reply_approval` / `reply_approver_id`, `plans.seats`, `tracks.decided_by` / `decided_role`, `events.actor_id`, `account_log.actor_id` | team members' names and emails (seen by the team), who did what on the desk |
| Plans | `plans`, `plan_requests` | org name, link, notes |
| Growth | `waitlist`, `invites`, `newsletter_subscribers`, `contact_messages`, `reopen_alerts` ("email me when it reopens": sender email + receiver, sent rows deleted after 30 days, unanswered after a year; in data copies and erasure) | name, email, links |
| Ops | `ops_members`, `admin_sessions`, `admin_log`, `account_notes`, `partner_notes`, `incidents`, `job_runs`, `switches`, `site_content*` | staff emails, notes about users |
| Abuse/safety | `rate_events`, `platform_blocks`, `takedowns`, `protected_names`, `email_suppressions`, `storage_deletions`, `vault_copies` (which stored files are in the recovery bucket) | IPs, emails (rate events deleted within 3 days) |

## Who can see what

| Who | Can see |
|---|---|
| Receiver | their own account, collections, tracks sent to them, senders' names/emails/links, their own logs |
| Team member (held) | the account's desk while they're on it (tracks, senders, notes, replies, activity), with the plan's features; never the owner's security, billing or plan settings; nothing of the team after they leave or are removed |
| Sender | their own receipts (by private token or confirmed email), not the receiver's notes |
| Share-link recipient (held) | only that collection's tracks sent while it allowed sharing, after an email code (or confirmed-email sign-in) and the access notice; listen, download only if granted; account holders also by `/c/a.<id>` while signed in (that visit ends at sign-out); never other collections, senders' details or the owner's notes |
| Ops, by permission | **Customer Care**: overview, inbox, feedback, emails, user support (suspend/restore/notes), verification, partners. **Developer**: incidents, jobs, storage, speed, security, switches, metrics. **Product Lead**: metrics, feature use, feedback, announcements, site content, switches, plans (view), partners. **Sales & Marketing**: plan requests, waitlist, invites, partners, revenue, announcements, emails (view), metrics |
| Super admin only | ops team, takedowns, data requests/exports, admin log, editing plans/prices or someone's plan, deleting/erasing accounts, changing email/handle, resetting two-step, signing someone out everywhere, View as, users CSV |

Every ops page and action names its permission (`src/lib/ops-perms.ts`); the build fails if one doesn't.

The mobile app signs in as an `app` row in `sessions` (refresh token stored hashed); it holds no database or storage keys, and "sign out everywhere", password changes and suspensions end it like any browser session. Browser cookies only ever match `web` sessions. Files shared into the app wait in the app's own app-group folder on the phone until sent or removed (cleared after a day); nothing is uploaded until the sender presses Send. **Offline kept tracks** (opt-in, Prepare → Save for offline): copies of the receiver's kept tracks in the app's private storage, excluded from phone backups. The copy always matches the last sync (cleared or deleted tracks, including auto-deleted ones, leave at the next sync), is wiped on sign-out, on reaching sign-in, when another account syncs, and after 30 days without opening Prepare online. Download links are signed per track and receiver and last an hour; saving offline isn't recorded as a "Download" on the sender's receipt.

Ops reaching into the main site (on-page editing, read-only "View as") is bound to the exact ops session that started it: signing out of ops or its timeout ends it at once.

## Retention and deletion
- Undecided audio: 90 days. "Not for me": 30 days. Kept: until the receiver deletes. Artwork and stems go with their track (the sender's receipt keeps only the stem names, `tracks.stems_sent`, so it doesn't change when the track goes); an EP/album cover passes to the folder's next remaining track instead (`handOverFolderCovers`), and goes when the last of them goes.
- Deleting an account removes every file and row it owns; files are queued in `storage_deletions` and retried until gone (with their copies in the recovery bucket; a discarded upload is deleted again once its 15-minute upload link has expired, in case it was put back); backups age out within 30 days.
- Privacy requests (copy, erase) run from ops (super admin).
