# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Also wrapped as iPhone and Android apps with Capacitor 8; the wrapper loads the website, so the design language stays web. Native pieces: Share to FloorTest, background playback, offline kept tracks.)

## Users

Two primary customers, equal priority (confirmed 11 Oct 2026):

- **Individual receivers**: DJs and curators who get unreleased music every week. Situation: a phone or laptop between gigs, a queue of demos, a set on Friday. Job: hear what's new quickly, keep the good ones, get them into the set, stop digging through DMs.
- **Teams**: labels, radio stations and crews working one desk together (Owner, A&R / Admin, Members, each with their own login). Job: split the listening, agree on what to keep, answer artists in one voice, with the owner in control.

Every decision has to work for both: one person alone at their desk, and five people on the same desk.

Secondary audience, and the growth loop: **senders** (producers, artists, label reps). They want to know the track arrived and whether anyone heard it, and fear shouting into a void or a leak. A sender with a good experience may become a receiver.

Other people who touch the product: share-link recipients (named listeners on a private collection, verified by email) and the FloorTest ops team.

## Product Purpose

FloorTest is the receiving desk for unreleased music. A receiver shares one permanent link; senders upload original files (WAV or MP3) to it; the receiver listens, keeps or passes, and downloads what they'll play, ready for Rekordbox; the sender follows a private receipt that says what actually happened.

Success: receivers clear their queue faster and find the tracks they play out; senders trust the receipt; teams review together without losing control.

## Positioning

**Honest signals.** The sender sees exactly what happened to their track (Delivered, Listened, Downloaded, Replied, Played out) and nothing more. "Listened" means 30 seconds of real playback (or a quarter of a short track), and we say so. The receiver's Keep / Not for me stays private. No signal may ever claim more than it means; this honesty is the product's edge and the brand's.

## Operating Context

- Receivers: the Review Queue (play, Keep / Not for me, next), collections per callout with a brief, Prepare for set (named folders, Rekordbox XML, crate export), contacts with notes and replies, the bell for new tracks.
- Teams: one desk, switched to from the desk bar; comments and a shared shortlist (Review together); the owner or an A&R / Admin can override members' calls and can require approval before members' replies go to senders.
- Senders: the receiver's public page `floortest.app/<handle>` (brief, send form with required details: artist, genre, mix and release status, AI-use declaration, DJ-sets permission), a 6-digit email code if they have no account, then a receipt page and emails.
- Phones matter: review happens one-handed between gigs; the apps add sharing files in from other apps and offline kept tracks.
- Private beta: invite-only sign-up, site behind a coming-soon password, paid plans free until billing is switched on.

## Capabilities and Constraints

- Plans: Free (20 active tracks, 1 seat), Pro (500, 2 seats), Team (2,000, 5 seats), add-on seats set by ops. Seats get the plan's benefits only on that desk.
- Files: WAV or MP3, up to 250 MB, up to 3 tracks per send, or a folder (EP/album) on paid plans. Undecided tracks leave after 90 days, not-for-me after 30, kept tracks stay.
- Held behind switches until the lawyer approves wording: collection share links (named, verified listeners; reset, revoke, request to join).
- Every check runs on the server; secrets (share links, invites) are stored only as fingerprints.
- Terms: the vocabulary in `docs/brand-voice.md` is binding (your link, desk, Keep / Not for me, callout, crate…).
- Stack (existing): Next.js 16 App Router, React 19, Tailwind 4, Postgres (Neon, London), Cloudflare R2 storage, Vercel (London), Resend email. The six docs in `docs/` are the source of truth for features, flows and data.

## Brand Commitments

- Name: **FloorTest**. Category line: *The receiving desk for unreleased music.* Promise: *From private tracks to the DJ set.*
- Voice (binding, `docs/brand-voice.md`): booth-level plain, honest about signals, calm not hype (no exclamation marks, no "revolutionise"), on both sides of the desk (respect the sender, never mock demos).
- Operator: FloorTest Labs, being registered in Ghana; legal pages are drafts until the lawyer signs off.

## Evidence on Hand

- Real product, live at floortest.app in private beta with real receivers and senders.
- The pre-seed deck (Sept 2026) is referenced by the voice guide; it is not in this repository.
- No testimonials, customer logos, press or usage statistics exist for public use. Do not invent them.

## Product Principles

1. **Never let a signal claim more than it means.** Every status, count and email says exactly what happened.
2. **The receiver decides, privately.** Keep / Not for me never reaches the sender; the owner controls who hears what.
3. **From demo to the set in as few steps as possible.** Play, keep, next; then a crate ready for the booth.
4. **Respect both sides of the desk.** Senders get honest receipts and a fair process even when the answer is no.
5. **Solo or team, the same desk.** Features work for one person and for a team without a separate product.

## Accessibility & Inclusion

WCAG 2.2 AA (confirmed 11 Oct 2026). Night and Day themes both meet it; touch targets 44px on phones; reduced motion honoured without hiding state changes.
