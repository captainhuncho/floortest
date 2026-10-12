# FloorTest public copy: short, honest, let the images speak

Rule: each block = heading (2–6 words) + at most one line. Image = a phrase for the art team. Sentence case, no exclamation marks. `→` on primary CTAs only. ★ = my pick where I give two options.

---

## 1. Home `/`
**Job:** show a DJ in five seconds that new music lands in one place, gets heard, and goes to the set.

| # | Copy | Image |
|---|---|---|
| Eyebrow | The receiving desk for new music | — |
| Hero | **From the studio / *to the floor.*** · One link for every track you're sent. | Phone in a hand in a dim booth, Review Queue on screen, lime Keep lit |
| CTA | Claim your link → (invite only: Join the waitlist →) · secondary: See pricing | — |
| Tile 1 | **One link.** Put it in your bio. Senders do the rest. | Instagram bio with `floortest.app/<handle>` |
| Tile 2 | **Originals, not streams.** WAV or MP3, up to 250 MB. | Drop box filling with a WAV file name |
| Tile 3 | **Play, keep, next.** Keep / Not for me, then the next track. | Thumb mid-swipe on a track, Keep stamp |
| Tile 4 | **Your callout, your brief.** Say the BPM, genres and deadline. | Brief card: 120–124 · Afro house · Fri |
| Tile 5 | **Ready for Rekordbox.** Kept tracks in one crate, with the XML. | Laptop on a booth flight case, Rekordbox open with the crate |
| Tile 6 | **Bring your crew.** One desk, up to 5 seats. | Two laptops, same desk, a ★ Shortlisted line |
| Tile 7 | **Honest receipts.** Senders see what happened. Nothing more. | Receipt timeline: Delivered, Listened lit, rest dimmed |
| Tile 8 | **Private by default.** Your decisions never reach the sender. | Keep / Not for me buttons with a small lock |
| Plans | **Start free.** 20 tracks, no card. → See pricing | — |
| Close | **Your link is waiting.** · Claim your link → | Wide shot: crowd, booth light, phone glowing in the DJ's pocket |
| Footer | For DJs, curators and labels who live on new music. | — |

FAQ: keep, but collapsed and max 4 questions (account needed? files? who hears it? what's deleted when?). One-line answers.

---

## 2. Pricing `/pricing`
**Job:** let a DJ pick a plan in ten seconds and know nothing is hidden.

- Headline: **Start free. Grow when your inbox does.** (keep)
- Sub: Free for 20 tracks, for good.
- Toggle: Monthly · Yearly
- **Free** · $0 · 20 tracks · 1 seat · CTA: Claim your link
- **Pro** · $6.99/mo or $77.99/yr · 500 tracks · 2 seats · Folders (EP/album) · CTA: Start Pro
- **Team** · $19.99/mo or $199/yr · 2,000 tracks · 5 seats · Track artwork · CTA: Start Team
- Seats line: **Extra seats $4/mo.**
- Definition: **Active tracks** = waiting, kept and not for me.
- Beta banner (while billing is off): **In beta: invite only.** Paid plans are free until billing starts. ★ Option B: **Beta desks ride free.** 6 months free after launch, then 50% off a year.
- Image: none beside cards; one small strip of the Floor's "17 of 20 active tracks" line.

Flag: `docs/01-product.md` still says Team $12.99 / $144.99. Owner's 12 Oct decision is $19.99 / $199; the doc needs fixing.

---

## 3. Claim your link `/signup`
**Job:** get a handle claimed with no friction.

- Heading: **Claim your link**
- Sub: Free for 20 tracks. Your link never changes.
- Live preview under username: `floortest.app/` **yourname**
- Button: Claim your link →
- Footer: Have a desk? Log in
- Image: the claimed link as a QR on a phone, ready for a story.

## 4. Log in `/login`
**Job:** back in, fast.

- Heading: **Back to the desk** (keep)
- Buttons: Log in → · Email me a code · Continue with Google
- Footer: New here? Claim your link
- Image: none. Calm column; the crest only.

## 5. Waitlist (invite-only)
**Job:** take an email and set an honest expectation.

- Heading ★ **Invite only, for now.** / alt: **The desk opens soon.**
- Line: Leave your email. We'll send an invite when there's room.
- Field + button: Join the waitlist →
- After: **You're on the list.** One email when your invite is ready.
- Image: a queue of track rows, softly blurred, one lit lime.

## 6. Coming soon (beta gate)
**Job:** say almost nothing.

- Crest logo.
- **FloorTest.** Soon.
- Password field · Enter
- Image: none. Booth Black, one lime light.

---

## 7. Public send page `/<handle>`
**Job:** let a sender get one track to this receiver, confident about what happens to it.

| Block | Copy | Image |
|---|---|---|
| Kicker | Send music to | — |
| Name | **{Receiver}** | Receiver's own avatar/artwork |
| Brief | **What I'm looking for** · BPM · Genres · Wanted · Deadline · Note | — |
| Drop box | **Drop your track** · WAV or MP3, up to 250 MB. No account needed. | Dashed box, waveform icon |
| Promise (3 lines) | Only {receiver} can hear or download it. · Not kept? Deleted within 90 days. · You get a private receipt by email. | — |
| Button | Send track → | — |
| Done | **Delivered.** · Your receipt is in your email. | Check mark, then Delivered → Listened → Downloaded → Replied, first lit |
| Closed | **{Receiver} isn't taking tracks right now.** · This link stays the same. · Email me when it reopens | — |

Team version of line 1: Only {receiver} and their FloorTest team can hear or download it.

## 8. Sender's receipt `/receipt/<token>`
**Job:** tell the sender exactly what happened, and nothing more.

- Kicker: Private receipt
- Headline (live): **Maxwell listened.** 10 Oct, 17:04 / until then: **Waiting for Maxwell to listen.**
- Track line: title · artist
- Timeline: Delivered · Listened · Downloaded · Replied (done bright, to come dimmed)
- Fold: **What these mean** · Listened = 30 seconds of real playback.
- Fold: **Details** · Only {receiver} can hear or download it.
- Foot (public site only): DJ too? Get your own link.
- Image: none on the page; it *is* the image. Marketing shot: phone on a bedroom-studio desk showing "Maxwell listened."

## 9. Sent history `/sent`
**Job:** every send, status first, at a glance.

- Heading: **What you've sent**
- Row: status · track · to whom · date
- Fold: Older than 10 days
- Empty: **Nothing sent yet.** Send through a receiver's link.
- Image: none.

---

## 10. Trust & security `/trust`
**Job:** prove privacy with plain facts a sender or label can check.

| Tile | Copy | Image |
|---|---|---|
| Hero | **Your music, private by default.** · Here's what we do with it. | Close-up: a single WAV file name in a locked drop box |
| 1 | **Only who you choose.** The receiver hears it. Nobody else. | — |
| 2 | **Honest signals.** Listened means 30 seconds of real playback. | Receipt with the "What these mean" fold open |
| 3 | **Decisions stay private.** Senders never see Keep or Not for me. | — |
| 4 | **Deleted on time.** Not kept: 90 days. Not for me: 30. | Calendar strip with 30 and 90 marked |
| 5 | **Checked for viruses.** On our own servers. Never a third party. | — |
| 6 | **Stored in London.** Encrypted, with a separate recovery copy. | — |
| 7 | **Something wrong?** support@floortest.app · takedowns within 2 working days | — |

Flags: publish tile 5 only once the scanner is on (SCAN_URL set); tile 6's "separate recovery copy" only once BACKUP_BUCKET is on. "Encrypted" must be checked with engineering (R2 encrypts at rest; confirm before printing).

## 11. Contact
**Job:** one address, a real promise.

- Heading: **Talk to us**
- Line: support@floortest.app. A person answers.
- Small: Takedowns and impersonation: 2 working days. Everything else: 5.
- Image: none.

## 12. 404
**Job:** get them back without a joke at anyone's expense.

- Heading ★ **Nothing on this record.** / alt: **This page isn't here.**
- Line: Check the link, or head home.
- Buttons: Home · Claim your link
- Image: an empty turntable platter under one lime light.

---

## 13. Email subjects
Rule: the signal + the track. Sign-off `— FloorTest`.

| Email | Subject |
|---|---|
| Welcome | Your link is live: floortest.app/{handle} |
| First track arrived | First track on your desk: {track} |
| Listened (to sender) | Listened: {track} |
| First-track nudge (48 h) | ★ Share your link to get your first track / alt: Your desk is ready for its first track |
| Beta-to-paid notice | Billing starts {date}: your plan stays free for 6 months |

---

## Notes
- Every number here exists in the product or the 12 Oct decisions; none invented. No quotes, logos or stats.
- "Played out" left off the public pages; add it to the receipt timeline only where the product shows it.
- Words checked against `docs/brand-voice.md`: your link, desk, track, Keep / Not for me, callout, crate, receipt, the four signals.
