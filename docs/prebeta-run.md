# Five-person pre-beta run (before the 1 Nov private beta)

Plan item B0. Five testers use the live site (invite-only, behind the coming-soon password) on their own phones and
computers. It checks the whole product before the beta opens; it is not the beta. Fix and re-test every blocker before
inviting anyone else. Ideas that aren't defects go to a list for after the run, not into this build.

All five get their own private desk and use FloorTest the way it's meant to work: each shares their own link, and the
tracks come in through those links. Every tester both receives and sends.

Build under test: production `8fcd7ca` (security batch, live 28 Oct, [evidence](evidence/2026-10-28-ship-8fcd7ca.md)).

## When (owner, 28 Oct)
| Day | What |
|---|---|
| Wed 28 Oct | Owner asks each tester for the email they want their desk on (message 1 below). |
| Thu 29 Oct | Owner sends the five invites (Ops → Invites, list below) and, privately, the site password. Testers sign up, set up their desks on phone and computer, and share their links with each other. |
| Fri 30 Oct | Testers send to each other's desks and review what arrives, on phone and computer; the wifi-off upload test; dev runs the backend checks below and fixes blockers on a branch. |
| Sat 31 Oct | Re-test every blocker that was fixed; sign out everywhere; findings recorded and saved to `docs/evidence/`. |

The private beta opens Sun 1 Nov only if every blocker is fixed and re-tested; otherwise it moves.

## How to invite (owner)
1. **Ask for the email** (message 1, by text or WhatsApp, Wed 28 Oct).
2. **Invite** (Thu 29 Oct): Ops → Invites → paste the five emails and the note from the invite list below. Each gets a personal invite that
   works once.
3. **The site password:** everyone needs it while the site is behind the coming-soon page, and so does anyone a tester
   shares their link with. Send it yourself, privately, by message or call. Never in a FloorTest email, a document or
   a chat with Claude. Testers pass it on privately; if you'd rather it went no further than five people, ask them to
   share their links only with the other testers.

Message 1, asking for the email:

> Hi (name), I'm about to open FloorTest to a small private beta. It's a receiving desk for new music: you get one
> link, people send you tracks through it, and you listen, keep or pass, and reply in one place. Before the beta opens,
> five people are testing it properly, and I'd like you to be one of them.
>
> It runs Thursday 29 to Saturday 31 October, about 20 minutes a day on your phone and your computer. You'd set up
> your own private desk, share your link with the other testers, and send them a track or two, the way you'd really
> use it.
>
> If you're in, reply with the email you'd like the invite sent to. The site password comes in a separate message.

### Ops invite list (Thu 29 Oct)
Ops → Invites → **Invite by email**. One send covers all five: paste the emails into the box, the note into
"Personal note", then Send invites.

**The testers' emails never go in this repo.** The repository is public (since 28 Oct), so an address written here
is published. Keep the replies where they arrived (text or WhatsApp) and paste them from there straight into the
emails box, one per line. Don't paste them into a chat with Claude either.

Personal note (the box takes 300 characters at most and cuts anything longer; this one is 267). It appears in quotes
in the invite email, which already carries the sign-up link and the code:

> Thanks for testing before the beta, Thu 29 to Sat 31 Oct. Set up your desk on phone and computer, share your link
> with the other testers, and send a track to at least two of their desks. Test audio only, never an unreleased master.
> The site password comes separately.

Before sending:
- Each email is the exact address the tester gave. The code works only with that address, so a typo means a new invite.
- Ops skips an address that already has an account or a pending invite. The banner says "Sent 5 invites"; if it says
  skipped, check that row.

After sending: each row shows **Pending**, then **Joined @handle** once the tester signs up. Copy the handle into the
Who table's Desk link column. **Resend** emails the same code again; **Revoke** cancels an unused one (a typo).

With the site password message, add what the note leaves out: anyone a tester shares their link with needs the
password too, pass it on privately, and send anything that breaks with a screenshot and the time.

## Who
First name or initials only, never an email or phone number. "Email received" is the date their reply came in.

| # | Tester | Usual role | Email received | Invited | Desk link | Phone | Computer |
|---|---|---|---|---|---|---|---|
| 1 | | DJ | | | | | |
| 2 | | A&R or label | | | | | |
| 3 | | Curator or radio | | | | | |
| 4 | | Producer | | | | | |
| 5 | | Producer or artist | | | | | |

Each tester gets one invite, sets up a desk, shares its link with the other four, and sends to at least two of their
desks. Use test audio only: an old bounce or a draft, never an unreleased master.

## What each tester does

**Your desk (receiving), on the phone and the computer:**
1. Sign up with the invite, confirm the email, turn on two-step sign-in.
2. Copy your link and share it with the other testers; make a collection with a brief and share that link too.
3. When tracks arrive: play one for at least 30 s; check the sender's receipt shows Listened (ask the sender).
4. Keep one, Not for me one, reply to one, download one; build a crate in Prepare and download it.
5. Phone app (if installed): save kept tracks offline, sign out, check the saved tracks can't download again.
6. Sign out everywhere from Security; check the other device is signed out.

**Sending to the others, on the phone and the computer:**
1. Open another tester's link, send a WAV and an MP3 with artwork (at least two desks, once from each device).
2. Confirm the email code; check the receipt email arrives and the receipt page opens.
3. Start one upload and turn off wifi halfway; turn it back on and check it finishes or tells you clearly.
4. Watch the receipt change: Delivered, then Listened, Downloaded, Replied.
5. Try someone else's receipt link or a changed link: it must not show anything that isn't yours.

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
| Session revocation ends web and offline access | each tester, desk step 6 | |
| No cross-account access | each tester, sending step 5 | |
| Both scheduled jobs ran | Admin → Jobs; `/api/health` with the cron secret | |
| Backup made and restored | `scripts/restore-drill.ts` on last night's backup | |
| One deletion through the retry queue | Admin → Storage | |
| Incidents visible | Ops → Incidents | |

## Done when
All five finished both devices, every blocker is fixed and re-tested, and the record is saved in `docs/evidence/` with
the build it ran on.
