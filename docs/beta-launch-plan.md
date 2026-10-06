# Beta launch plan and pitch prep

Built from the deck's go-to-market slide ("design partners first, repeatable growth second") and what's live today.

## Goal for the beta (8 weeks)

Prove that DJs with weekly callouts **keep using** the desk, and that senders **become receivers**.

| Metric | Definition (all from the `events` table) | Target by week 8 |
| --- | --- | --- |
| Activated receivers | Link received ≥ 1 track, and receiver made ≥ 1 decision | 25 |
| Weekly active receivers | Made a decision in the last 7 days | 15 |
| Tracks per active receiver per week | | 10+ |
| Time to first listen | Median time from Delivered to Listened | Under 48 h |
| Sender → receiver conversion | Senders who later sign up | 5% |
| Kept → exported | Share of kept tracks downloaded in a crate | Tracks whether the "to the DJ set" promise is real |

## Phases

**Week 0: ready (this week)**
- Fix the "before invites" items in [legal-review.md](legal-review.md) and section 1 of [copy-review.md](copy-review.md).
- Verify the Resend domain so emails reach people other than you (open item in HANDOFF).
- ✅ Welcome email ([launch-emails.md](launch-emails.md) #2): sent once, when the account's email is confirmed. ✅ First-track nudge (#3): 7 days after sign-up if no track has arrived (morning job).
- Uptime monitor on `/api/health`.

**Weeks 1–2: 10 design partners, by hand**
- List 30 DJs and curators you know who run callouts (Afro house, amapiano and house scenes in London and Lagos fit the default genres and your network).
- Send invite #1 personally. Help each one post their first callout with the template.
- 15-minute call after their first 10 tracks: what's missing, what's slow, would they pay?

**Weeks 3–5: the sender loop**
- Every sender sees FloorTest through the upload page and emails. Add a small line on the receipt page: "Get your own link" for producers who also DJ.
- Give each partner 5 invite codes (the referral system already rewards both sides).

**Weeks 6–8: widen**
- Open to a waitlist of 100. Post the social set weekly.
- Test pricing with 10 active users: "Would you pay $X for 500 tracks?" Choose before announcing prices.

## After the beta: paid features (Pro and above)
Built or planned, switched on per plan from Admin → Feature switches once billing is live:
- **Stems:** built, held back (`stems` feature switch, no plans yet).
- **Shared collections (Team, on):** the owner adds up to 10 FloorTest accounts to a collection (Collections → open one → Teammates). Teammates listen and vote keep or pass with a note under Collections → Shared with you; they can't download, decide or reply. They only hear tracks sent after they were added, and the send pages name the team before anyone sends. Votes show in the owner's lists and review panel. Access pauses if the owner leaves Team. Lawyer: confirm the privacy policy covers teammates hearing a track.
- **Send folders (built, off):** Pro and Team can send a whole folder of tracks in one go, up to **250 MB in total**, from Send music (and later the sender page). Each file goes through the same checks as a single track (real WAV/MP3, no hidden payloads). The receiver sees them as one batch with each track reviewable on its own. Add it to the feature registry (`src/lib/features.ts`) with no plans in the beta, then enable for Pro and Team.

## Sign-up page improvements (noted 2026-10-06)
- "What best describes you?" becomes a dropdown (DJ or curator / Producer / Label or A&R), not three radio boxes. The radios also look like filled white dots before anything is picked, which reads as all selected.
- The link field's prefix wraps onto two lines on phones (long domains like the trial's). Show just "/" plus the name, or put the full address as a hint under the field.
- Too many boxes at once: group the three tick boxes visually (required agreement first, the two optional emails as a smaller "Email me" group, perhaps collapsed).
- Invite code only when sign-up is invite-only (already the case); when shown, place it last or make it clearer it comes from an invite email.
- Match the desktop Figma layout on phones too (spacing, 40px heading scales down).

## Revenue ideas to revisit (parked 2026-10-06)
**Launch plan shape (proposed):** Free stays generous so links keep bringing in senders; Pro gets the power features. Free: 20 active tracks, undecided tracks kept 30 days, 2 collections, FloorTest-branded link page. Pro: 500 tracks, 90 days, unlimited collections, Rekordbox/crate export, own branding, listening insights. Team: 2,000 tracks plus teammates and votes, priced per seat for labels. Beta users keep what they signed up with; changes apply to new sign-ups after notice. Pro trial (14 days) offered at the moment someone hits a limit; annual plans (e.g. Pro $59/year).

**Add-ons for Free users (come back to this):** small paid extras for people who won't subscribe. Candidates: crate export ($2 each), +50 track slots for 30 days ($3), keep a track longer ($1/track/year), branded link page ($2/month). Guardrails: 3 add-ons must cost more than Pro, so checkout can say "Pro includes all of these"; at most 3–4 add-ons; Team features (teammates, votes, shared collections) are never add-ons; never sell queue priority to senders ("pay to be heard"). Order: connect payments first (Paddle recommended: it handles UK/EU/US tax as merchant of record), launch Pro and Team only, then add one or two add-ons based on which limits Free users actually hit.

**Hosting decision (open):** stay on Vercel Pro, or move to Cloudflare Workers + Neon before the beta (one move while there are no users). Cloudflare is cheaper (about $5–35/month vs $20–150 as you grow) but needs a 2–3 day trial first: does the app fit Cloudflare's 10 MB size limit, and do crate/stems ZIP downloads stay within CPU (5 min max) and memory (128 MB) limits. Permanent domain and a database move to Neon are worth doing before the beta either way.

## Settings to change by hand (backend review, 2026-10-05)
- **Supabase connection pooler:** in Vercel, `DATABASE_URL` should use Supabase's pooler (port **6543**, "Transaction" mode), and set `DB_POOL_MAX=2`.
- **Database updates at deploy:** set `DB_AUTO_MIGRATE=false` in Vercel Production. Updates now run during each Vercel build (`vercel-build`).
- **Alerts that don't depend on email:** set `ALERT_WEBHOOK_URL` (a Discord or Slack webhook) so incident alerts still arrive if Resend is down.
- **Uptime monitor:** a free UptimeRobot (or similar) check on `https://floortest.imullar.com/api/health` every 5 minutes, alerting you.
- **Resend plan:** the free plan stops at 100 emails a day / 3,000 a month. Upgrade before invites go out, then set `MAIL_DAILY_LIMIT` and `MAIL_MONTHLY_LIMIT` in Vercel. Admin → Emails shows usage.

## Before public launch (checklist)
- **Security test with Strix** (open-source AI pentest agents, github.com/usestrix/strix): run once against the **local copy or a preview**, never the live site, once the feature set is stable. Needs Docker and an AI model key (a few to tens of dollars per run). Fix every confirmed finding, then re-run.
- **Lawyer review** of the legal drafts ([legal-review.md](legal-review.md)), then replace the "draft" banners.
- **Registrations:** Ghana Data Protection Commission, US DMCA designated agent, UK/EU representatives if the lawyer says so.
- **Operator details** on the legal pages: registered company name, address, registration number.
- **Paid infrastructure:** Supabase Pro (daily backups, point-in-time recovery), R2 versioning or a second recovery bucket.
- **Antivirus scanning** of uploads (see Risks).
- **Payments**, if charging at launch: plan changes go through checkout, not the self-serve switch.
- **Full accessibility audit** (WCAG 2.2 AA) and an INP measurement on real devices. (1) ✅ 2026-10-04: axe-core scan of every main page in Night and Day and at phone width, plus keyboard checks; fixed pinch-zoom being locked, one low-contrast line, the loading placeholder label, a small tap target and Escape on the Feedback panel. (2) Still to do: a pass with a real screen reader (VoiceOver on iPhone and Mac) and INP on a real phone.
- **Before opening sign-up to everyone:** stop sign-up revealing which emails have accounts. Always answer "Check your email", and email existing owners a "you already have an account, log in here" note instead. Today this is only reachable with a valid invite code.
- **DMARC** moved from `p=none` to `p=quarantine` after two clean weeks.
- **Database network hardening:** (1) ✅ done 2026-10-03: the Postgres client sets `ssl: "require"` on Vercel; (2) check whether Supabase network restrictions can limit connections to Vercel. Vercel Hobby has no fixed outbound IPs, so this may need Vercel's Secure Compute or a different setup. FloorTest has no Cloudflare-proxied origin to hide: DNS points at Vercel (76.76.21.21) and Vercel is the edge.

## Weekly rhythm
Monday: check metrics. Tuesday–Thursday: partner calls and fixes. Friday: one post, one changelog note to partners.

## Risks

| Risk | Mitigation |
| --- | --- |
| Emails don't arrive (Resend domain unverified) | Blocker; fix in week 0 |
| A bad file reaches a DJ's laptop (no AV scan) | Say so plainly; add scanning before public launch |
| DJs won't move senders off DMs | Callout template + "you'll know when I've listened" is the carrot for senders |
| Free tier is too generous to convert | 20 tracks is small once active. Measure how many hit the limit |

---

# Pitch prep

## The 30-second version
> Every week DJs get hundreds of unreleased tracks across DMs, email and expiring links. They lose good music and artists never hear back. FloorTest gives every DJ one link: artists upload the original file, the DJ plays, keeps or passes in seconds, and kept tracks export straight into Rekordbox. The artist gets told, honestly, when it's been listened to or downloaded. We're in private beta with {n} DJs.

## Story (matches the deck, updated for what's built)
1. **Problem:** submissions lose context before anyone presses play.
2. **Product:** one link; the receiver chooses where it routes. *Live now.*
3. **Loop:** upload → collection → listen/download → sender told. *Live now.*
4. **Why DJs:** routing, fast decisions, Rekordbox export (*live*); BPM and waveform (*live*).
5. **Why artists:** no account, honest signals.
6. **Model:** a free tier capped at 20 active tracks → Pro → Team. Paid prices under test.
7. **Wedge:** DJs with weekly callouts; every submission brings a sender who might DJ too.
8. **Traction:** beta metrics above. This slide doesn't exist yet and it's what investors will ask for first.
9. **Ask:** design partners, a technical collaborator, pre-seed.

## Deck updates needed
- Slide 5 says "key, mood, energy and quality" sit beside every decision. Today it's BPM, waveform and length. Fix, or mark as roadmap.
- Slide 4 "alerts the sender": add "replied".
- Add a traction slide once week 4 data exists.

## Likely questions and answers

| Question | Answer |
| --- | --- |
| Why won't DJs just use Dropbox or a Google Form? | Those move files. FloorTest makes the decision fast (play, K, next), keeps sender history, and closes the loop with the artist. That's the part DJs hate doing. |
| What stops SubmitHub or LabelRadar copying this? | They're built for senders paying to pitch. We're built for the receiver: free for artists, and the DJ is the customer. Different incentive. |
| Will DJs pay? | That's what the beta tests. The signal is desks hitting the 20-track limit and exporting crates. |
| How do you grow? | Every callout exposes FloorTest to dozens of senders; many producers DJ too. Referrals reward both sides. |
| Unreleased music is sensitive. Why trust you? | Original files only go to the receiver, via short-lived signed links. Clear deletion windows. Signals are strictly defined. |
| What's the moat? | Relationship history: every play, download and reply builds a record the DJ doesn't want to lose. |
