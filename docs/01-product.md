# 01 · Product requirements

FloorTest is a private receiving desk for unreleased music. A receiver (DJ, curator, label) shares one link; artists (senders) upload original files to it; the receiver listens, decides and downloads what they'll play; the sender sees what happened to their track.

Keep this file true to what is live. Any change to a feature updates its row here in the same commit (see `CLAUDE.md` → Docs).

## People

| Who | Account? | What they do |
|---|---|---|
| Receiver | Yes (invite-only in the beta) | Owns a link `floortest.app/<handle>`, reviews, keeps, downloads |
| Sender | No (email code), or sends from their own account | Uploads tracks to a receiver's link, follows a receipt |
| Colleague | Yes | Listens to tracks a receiver shared (held: switch `sharing` off) |
| Ops team | Separate sign-in at ops.floortest.app | Super admin + Customer Care, Developer, Product Lead, Sales & Marketing (see 05) |

## Features (receiver)

| Area | What it does | Where |
|---|---|---|
| Sign-up / sign-in | Invite code during beta (switch `open_signup` opens it). Email + password, emailed one-time code, or Continue with Google (Gmail/Workspace only, Google account pinned, password to approve first link). Optional two-factor (authenticator + recovery codes), sign-in alerts | `/signup`, `/login`, `/login/code`, `/signup/google`, `/login/google` |
| The Floor (home) | Greeting, link status (open / closed / paused / full), Send music box, stats (Received, Waiting, Kept, First listen), Up next, Receiving now, 14-day chart, genre mix, activity, top contacts, onboarding checklist | `/dashboard/floor` |
| Collections | One per callout. Brief (genres, BPM range, wanted, note), close date, track cap, artwork, colleague sharing flag. One collection is "receiving" at a time. Delete needs the name typed in CAPS | `/dashboard/collections`, `/[id]` |
| Review Queue | Play with waveform (lock-screen controls incl. next/previous on phones), keep / not for me / undo; on phones drag the track right to keep or left for not for me (follows the finger with a stamp, snaps back if short, haptic tap in the app), reply (templates), cues, energy, notes; list and queue views; keyboard shortcuts; releases (EP/album) grouped | `/dashboard/review` |
| Prepare for set | Kept tracks batch. **Download kept** (new named folder + M3U8, optional Rekordbox XML), **Files only**, **Clear kept** (confirms). In the phone apps, **Save for offline** keeps the kept tracks on the phone; with no connection the offline screen lists them under "Saved on this phone" and plays them (lock screen / notification controls too) | `/dashboard/prepare` |
| Downloads | Same pair everywhere: Download collection / Download kept + Files only | collection page, card menu, Prepare |
| Contacts | Everyone who sent: counts, verified badge, messages, block | `/dashboard/contacts` |
| Send | Send your own music to another link; sent list with progress (Delivered → Listened → Downloaded → Replied → Played out); sends older than 10 days fold under "Older than 10 days". In the iPhone and Android apps, **Share to FloorTest** (from Files, Dropbox, WeTransfer… any app's share sheet, WAV/MP3, up to 3) opens this page with the files already in the form ("Shared to FloorTest" box, Remove clears them) | `/dashboard/send` |
| Account / Settings | Profile + public page, receiving rules, notifications, plan, security (password, devices, two-factor, Google sign-in), delete account, Day/Night/System theme | `/dashboard/account`, `/dashboard/settings/*` |
| Plans | Paid via Paddle on the web; in the (planned) app via Apple/Google in-app purchase — one plan per account either way. Free (20 tracks), Pro ($6.99/mo, $77.99/yr, 500 tracks, folders 1 GB), Team ($12.99/mo, $144.99/yr, 2000 tracks, folders 3 GB, track artwork). Discounts set in ops. Beta: Pro/Team by request (form), free. After beta: self-serve subscription | `/dashboard/plans`, `/request`, `/checkout` |
| Referrals | Bonus track slots for both sides once the friend's first track arrives | `/dashboard/referrals` |

## Features (sender)

| Area | What it does | Where |
|---|---|---|
| Send to a link | WAV/MP3 ≤ 250 MB, up to 3 tracks per send; title, artist, genre, mix and release status, AI use (required), message, DJ-sets permission; email code first (no account) | `/<handle>` |
| Folders (Pro/Team receivers) | EP/album up to 12 tracks within the receiver's folder size | `/<handle>` → Send folders |
| Track artwork (Team receivers) | Optional JPG/PNG/WebP ≤ 25 MB, kept at original quality; one cover per folder | send form |
| Receipt | Follow one track: delivered, listened, downloaded, replied, played out | `/receipt/<token>`, `/sent` |

## Features (ops)
| Area | What it does | Where |
|---|---|---|
| Edit the site on the page | Ops staff with Site content open the real page from ops (**Edit on the page ↗**): click text to type, click a list (steps, questions) to edit it, click the product image to replace it, drag sections (or ↑ ↓) and hide/show them. Saves to a draft; **Publish** puts it live; versions kept to restore. Home has all of this; Pricing, Sign-up/Log-in, the public link page and receipts have text editing (wording with fill-ins like {receiver} opens in a box) | ops → Site content, then floortest.app in edit mode |

## Rules that define the product
- Uploads are originals, never transcoded. Previews (smaller stream copies) are planned for launch, made on the server only (see 06).
- Retention: undecided audio deleted after 90 days, "not for me" after 30 days; kept stays until the receiver deletes. Artwork is deleted with its track.
- Nothing is shared or released without the sender's permission; DJ-set use only if the sender ticks it.
- Sign-up and password reset never reveal whether an email has an account.

## Out of scope / held
Colleague sharing (built, switch off until after beta), stems (built, paid, hidden), card payments (Paddle, before paid launch), mobile app (parked), Rekordbox how-to video (parked).
