# Five-person pre-beta run (before the 1 Nov private beta)

Plan item B0. Five testers use the live site (invite-only, behind the coming-soon password) on their own phones and
computers. It checks the whole product before the beta opens; it is not the beta. Fix and re-test every blocker before
inviting anyone else. Ideas that aren't defects go to a list for after the run, not into this build.

## When (owner, 28 Oct)
| Day | What |
|---|---|
| Thu 29 Oct | Owner sends the receivers' invites (Ops → Invites) and, privately, the site password and links. Receivers sign up and set up their desks; senders send their first tracks. |
| Fri 30 Oct | Receivers review on phone and computer; senders watch their receipts; the wifi-off upload test; dev runs the backend checks below and fixes blockers on a branch. |
| Sat 31 Oct | Re-test every blocker that was fixed; sign out everywhere; findings recorded and saved to `docs/evidence/`. |

The private beta opens Sun 1 Nov only if every blocker is fixed and re-tested; otherwise it moves.

## How to invite (owner)
- **Receivers (1–3):** Ops → Invites → paste their three emails, with the note below. Each gets a personal invite that
  works once.
- **Senders (4–5):** no account needed. Send them the receivers' links once the desks exist, with the message below.
- **The site password:** everyone needs it while the site is behind the coming-soon page (a receiver's link asks for it
  too). Send it yourself, privately, by message or call. Never in a FloorTest email, a document or a chat with Claude.

Invite note for Ops → Invites (receivers):

> Thanks for testing FloorTest before the beta. Please set up your desk on your phone and your computer between
> Thursday 29 and Saturday 31 October. I'll send you the password for the site separately. Use test audio only: an old
> bounce or a draft, never an unreleased master. Anything that breaks or makes you stop and think, send me a
> screenshot with the time.

Message to senders (by message, once the desks exist):

> Thanks for testing FloorTest before the beta. Between Thursday 29 and Saturday 31 October, please send a track to at
> least two of these desks, once from your phone and once from your computer: (the three receivers' links). The site
> password follows separately. Send test audio only: an old bounce or a draft, never an unreleased master. Watch your
> receipt page and tell me what changes and when. Anything that breaks or makes you stop and think, send me a
> screenshot with the time.

## Who
| # | Tester | Role | Phone | Computer |
|---|---|---|---|---|
| 1 | | Receiver (DJ) | | |
| 2 | | Receiver (A&R or label) | | |
| 3 | | Receiver (curator or radio) | | |
| 4 | | Sender (producer) | | |
| 5 | | Sender (producer or artist) | | |

Each receiver gets one invite and sets up a desk. Each sender sends to at least two of the three receivers. Use test
audio only: an old bounce or a draft, never an unreleased master.

## What each tester does

**Receivers (1–3), on the phone and the computer:**
1. Sign up with the invite, confirm the email, turn on two-step sign-in.
2. Make a collection with a brief; share the link.
3. When tracks arrive: play one for at least 30 s; check the sender's receipt shows Listened (ask the sender).
4. Keep one, Not for me one, reply to one, download one; build a crate in Prepare and download it.
5. Phone app (if installed): save kept tracks offline, sign out, check the saved tracks can't download again.
6. Sign out everywhere from Security; check the other device is signed out.

**Senders (4–5), on the phone and the computer:**
1. Open a receiver's link, send a WAV and an MP3 with artwork.
2. Confirm the email code; check the receipt email arrives and the receipt page opens.
3. Start one upload and turn off wifi halfway; turn it back on and check it finishes or tells you clearly.
4. Watch the receipt change: Delivered, then Listened, Downloaded, Replied.
5. Try another receiver's receipt link or a changed link: it must not show anything that isn't yours.

**Everyone:** note anything that broke, failed to arrive, or made you stop and think. A screenshot with the time is
enough.

## Record
One row per finding. Severity: **blocker** (stops a journey or shows someone else's data), **fix** (works but wrong or
confusing), **later** (an idea).

| When | Tester | Device and browser | Build | What happened | Severity | Fixed in | Re-tested |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Backend checks (dev, during the run)
| Check | How | Result |
|---|---|---|
| Upload start and completion per tester | Admin → Senders / Activity; outbox | |
| Email verification and receipt emails delivered | Admin → Emails sent (Resend status) | |
| First valid Listened per track (server-counted) | track events | |
| A duplicate completion makes one track | e2e `upload-resilience` plus one manual retry | |
| Session revocation ends web and offline access | tester 1, step 6 | |
| No cross-account access | testers 4–5, step 5 | |
| Both scheduled jobs ran | Admin → Jobs; `/api/health` with the cron secret | |
| Backup made and restored | `scripts/restore-drill.ts` on last night's backup | |
| One deletion through the retry queue | Admin → Storage | |
| Incidents visible | Ops → Incidents | |

## Done when
All five finished both devices, every blocker is fixed and re-tested, and the record is saved in `docs/evidence/` with
the build it ran on.
