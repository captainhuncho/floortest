# 01 · Product requirements

FloorTest is a private receiving desk for new music: exclusives and works in progress that DJs test on the floor, and released tracks too. A receiver (DJ, curator, label) shares one link; artists (senders) upload original files to it; the receiver listens, decides and downloads what they'll play; the sender sees what happened to their track.

Keep this file and `docs/product/` true to what is live. Any change to a feature updates its section in `docs/product/<area>.md` in the same commit (see `CLAUDE.md` → Docs); a new feature adds its section there and one line to the list below.

## People

| Who | Account? | What they do |
|---|---|---|
| Receiver | Yes (invite-only in the beta) | Owns a link `floortest.app/<handle>`, reviews, keeps, downloads |
| Sender | No (email code), or sends from their own account | Uploads tracks to a receiver's link, follows a receipt |
| Share-link recipient | No (email code) or yes | Listens to a collection a receiver shared with them by name (held: switch `sharing` off) |
| Team member | Yes, their own login | Works on an organisation's desk (label, radio, crew) as A&R / Admin or Member; see Account teams |
| Ops team | Separate sign-in at ops.floortest.app. Metrics leads with the north star: tracks decided within 7 days of arriving, last 8 full weeks, by week, plan and solo/team desk (`src/lib/north-star.ts`) | Super admin + Customer Care, Developer, Product Lead, Sales & Marketing (see 05) |

## Features (receiver)

One section per feature in [`docs/product/receiver.md`](product/receiver.md):

- Sign-up / sign-in
- Floor (home)
- Tour / How FloorTest works
- Collections
- Callout card
- Projects
- Queue
- Prepare
- Downloads
- Contacts
- Activity
- Send
- Account / Settings
- Plans
- Referrals
- Notes

## Features (sender)

One section per feature in [`docs/product/sender.md`](product/sender.md):

- Send to a link
- Folders (Pro/Team receivers)
- Review Together (part of Account teams)
- Collection share links (held: switch `sharing` off)
- Callout share card
- Account teams (switch `teams`: on 11–15 Oct, off on the live site since the 15 Oct beta scope; teams work only on ops super-admin desks)
- Track artwork (Team receivers)
- Receipt
- Public site (31 Oct redesign)

## Features (ops)

One section per feature in [`docs/product/ops.md`](product/ops.md):

- Edit the site on the page
- Ops look and Overview
- Site lock (switch `site_lock`, on by default; 13 Nov)
- Ops → Notices
- Ops shell (admin redesign B, step 2, 1 Nov; switch `ops_shell`, off by default)
- Ops → Leave beta (13 Nov; super admin only, under Product → Control)
- Ops Overview, "Waiting on me" (admin redesign B, step 3, 1 Nov; same switch `ops_shell`; **not shown since 2 Nov**)
- Ops kit and ⌘K (admin redesign B, step 1, 1 Nov)
- Growth & decisions
- Ops on phones
- Ops on phones, new look (admin redesign B, step 6, 2 Nov; switch `ops_shell`)
- Users list
- Users, new look (admin redesign B, step 5, 1 Nov; switch `ops_shell`)
- User account (ops)
- Verification
- Moderation

## Rules that define the product
- Uploads are originals, never transcoded. Previews (smaller stream copies) are planned for launch, made on the server only (see 06).
- Retention: undecided audio deleted after 90 days, "not for me" after 30 days; kept stays until the receiver deletes. Artwork is deleted with its track.
- Nothing is shared or released without the sender's permission. Sending to a Label or A&R desk is evaluation only unless the sender chooses OK to play; sending to any other desk means it may be played (owner, 15 Nov).
- **Account types** (14 Oct; Label and Radio split 5 Nov): DJ, Producer / DJ, A&R, Label, Radio, Artist, Curator, Music professional. Existing Label / Radio accounts became Label (migration 0129); a feature-switch rule that named Label / Radio now names both. A switch rule or announcement filter that names a type that no longer exists reaches nobody, never everyone. A type switches on the tools that desk is likely to need and never locks anything: Settings → Profile → Tools turns any tool on or off. The type belongs to the account, so every seat on a team desk sees the same tools; only the owner changes it. Price and limits never depend on type. Tools so far: **Played out** (the Monday question, the Tuesday email, the pick page and Played it out on Prepare), on by default for DJ, Producer / DJ and Curator. New type-specific features add a tool in `src/lib/account-types.ts` and check it with `hasTool()`.
- Sign-up and password reset never reveal whether an email has an account.
- Consent before tracking (owner, 20 Oct): a cookie banner asks first; visit counts (Vercel Analytics) and browser crash reports (Sentry) run only after Accept. Not now is as easy as Accept, both are remembered, and Cookie settings (footer, sign-in pages) asks again. On the ops host the banner's Cookie Policy link goes to the main site's /cookies (the ops host has no public pages).
- **Private link pages hide the email (owner, 2 Nov):** `/receipt/…`, `/sent/…`, `/join/…`, `/verify-email/…` and `/confirm-email/…` show the address the link was sent to masked, `m•••@g•••.com` (first letter, first letter of the domain, last part of the domain; `src/lib/mask-email.ts`), in the page and in the data React loads with it. In full only to the account it belongs to, signed in: the invitee on `/join` ("You're signed in as …"), the account on `/verify-email`, and the new address on `/confirm-email` once signed in. A different account on an invite sees the invited address masked, in the page and in the Join error. Browsers and caches don't keep these pages and other sites aren't told their address (headers in `docs/02-technical.md`). The receipt shows the track, receiver and note only after proof (Receipt row).
- **Email-link and error pages** (owner, 31 Oct): every page opened from an email (share gate `/c/…`, team invite `/join/…`, `/verify-email/…`, `/confirm-email/…`, `/newsletter/confirm|unsubscribe/…`, `/unsubscribe/…`, `/sent/reopen/…`) and every error or not-found screen is one message: the logo on top, a small state mark, the title, one or two lines and one lime action, centred about 43% down; on the page on phones, on a card from 640px; light or dark with the device (`MessagePage`, `src/app/_ui/`). Each link has one answer for invalid, expired, used or switched off, so it never says which. The newsletter confirm and unsubscribe and the reopen-alert confirm act only from their button (a POST, `ConfirmByPost`): opening the link shows the question and changes nothing, so a mail scanner that opens every link can't confirm for someone (2 Nov). Errors show a plain message only (owner, 31 Oct, "Hide the stack"): never the error text, its code (digest), a stack or the framework's name; those go to Sentry and the server log. Boundaries: site-wide `error.tsx` (Try again, Go to FloorTest; reloads once by itself after an update), `global-error.tsx` (own styles, works without the app's layout, Reload), `not-found.tsx`; the desk has its own `error.tsx` and `not-found.tsx` that keep the menu ("Nothing here" for a page that isn't there or isn't yours); a one-word address and a receipt link have their own not-found ("Nothing on this link", "This receipt isn't available" with Email me my sends).
- Dates read one way everywhere: "29 Sept 2026" for days, "10 Oct, 17:04" for moments.
- **Pop-ups, messages and failures (owner, 31 Oct):** every question before a change is the app's own dialog, never the browser's grey box (Delete file, Block sender, Remove / Reset / Revoke a share link, Stop private sharing, Start a new batch, leaving the site editor with unsaved changes): a bottom sheet on phones and a centred box on wider screens, the question as its title and what happens in a sentence under it, Cancel and a button named for the action (solid red when it removes something; Cancel has the focus then). If the change doesn't go through, the dialog stays open and says nothing changed. Short messages after an action ("Link paused", "Removed. Their access has ended.") appear at the bottom, above the tab bar, mini player or batch bar, up to three at once; failures say so with a mark, stay longer, and say what to do next. A track that won't play says so instead of stopping silently. Every failure message says what happened and what to do next, in plain words, without internals; sign-in and sign-up messages never reveal whether an email has an account.
- **Emails to senders** (`/dashboard/emails`, owner and A&R / Admin): everything FloorTest emailed senders for this desk, newest first (last 200), each with its status in words (Sent, Sending, Not delivered, Not sent: refused earlier, Saved here only) and the full text one tap away; a banner counts any not delivered, and says plainly when email isn't switched on for that copy of FloorTest.

## Out of scope / held
Collection share links (built, switch `sharing` off until the lawyer approves the wording; the 1 Oct per-track colleague sharing was retired 11 Oct), stems (built, paid, hidden), card payments (Paddle, before paid launch), mobile app (parked), Rekordbox how-to video (parked).
