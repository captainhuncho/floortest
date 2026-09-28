# Copy review: site, emails, invites and launch posts

Reviewed against [brand-voice.md](brand-voice.md), 27 Sep 2026. Findings are ordered by impact. Nothing in the code has been changed yet.

## 1. Fix before inviting anyone

| # | Where | Problem | Suggested fix |
| --- | --- | --- | --- |
| 1 | Home, journey step "Downloaded" ([page.tsx:15](../src/app/page.tsx)) | "The file went to the booth" overclaims. The Listened email itself says a signal "doesn't say anything about whether it'll be played out". The home page contradicts the product's own honesty. | "The original file was downloaded" |
| 2 | Sign-up subtitle vs home pricing | Sign-up says "Free for 20 active songs". Home FAQ says "every plan is free" during beta. Both are true, but read together they sound like a contradiction. | Lead with the free tier; treat beta access to paid plans as a bonus. Sign-up: "One link for every callout. Free for up to 20 active tracks." FAQ "Is it free?": "Yes, for up to 20 active tracks, and free forever at that size. During the beta, Pro and Team are free too." |
| 3 | Hero trust strip: "Every decision undoable" | Undo only covers recent decisions (toast + U key). If older decisions can also be changed from the track, say "Change any decision later"; otherwise "Undo any decision". | Check behaviour, then pick the accurate one |
| 4 | Home "Clear retention" | Mixes plan limits (20 tracks) into retention, and leaves out that "could be better" tracks go after 30 days. Missing facts here are what the Terms/Privacy lawyers will check. | "Undecided tracks are deleted after 90 days, could-be-better tracks 30 days after you mark them. Kept tracks stay until you delete them." |
| 5 | Pricing shows $20 and $60 "after beta" | The deck says pricing "should be validated with early users". Printing it publicly now makes it hard to change and may put off the beta DJs you most want. | Show plan limits, drop the prices: "Paid plans come after the beta. Beta users hear first and get a founding rate." (Only promise the founding rate if you mean it.) |

## 2. Consistency (one pass, low risk)

- **Names for the link:** "receiving link", "receiver link", "permanent receiver link", "your link", "demo submission link", "permanent link". Use *your link* / *receiving link* only.
- **Songs vs tracks:** plans say "active songs", everything else says tracks. Change `PLANS` labels, sign-up, referral page and referral email ("10 more song slots") to *tracks*.
- **CTA case:** "Claim your receiving link →", "Get your link", "Claim your link →", "claim your permanent link →", "open your desk →", "view a demo submission link ↗", "try the sender view →". Make them all sentence case: *Claim your link*, *Open your desk*, *See a demo link*, *Try the sender view*. `↗` implies a new site; the demo is on-site, so use `→`.
- **Audience lines:** footer says "DJs and curators", the For-section says "DJs, performers & labels", sign-up says "DJ / curator name". Standardise on *DJs, curators and labels*, and make the field "Your name or alias".
- **Sign-up button** "Create receiver": jargon. Use *Create my link*.

## 3. Home page, section by section

| Section | Keep | Change |
| --- | --- | --- |
| Hero | The headline and category line are strong and match the deck. | Body: "One permanent link for every demo you're sent. Hear what's new in seconds, keep what's right for your set, and answer every sender without a single DM." ("works for your set" → "right for your set" is optional.) |
| Link card | Excellent: shows the product in one glance. | None. |
| Journey | "Know what happened next." is the best line on the page. | Fix #1. Body: "FloorTest records the four moments that matter between sending a track and hearing back." ("quietly... in a room" is vague.) |
| Why | Old way / new way contrast works. | "Meaningful activity reaches the sender" → "Senders hear when it's listened to, downloaded or replied to." |
| How | Clear four steps. | "One link. A visible relationship." is abstract. Try "One link. Four steps." or "Share once. Decide fast." |
| For receivers / senders | "Send it once. Stop wondering." is great. | "Your private receiving room" → "Every demo in one place." (avoid a third name for the desk). |
| Private by design | Strong headline. | Fix #4. |
| Pricing | | Fix #5. Headline "Receiving should be easy." → "Start free. Grow when your inbox does." Subline: "Free for up to 20 active tracks, for good. Pro and Team are free during the beta." |
| Closing | | Eyebrow "Your music network" promises a feature that doesn't exist; use "Your link. Your collections. Your call." Headline → "Every demo in one place. Ready to play." |

## 4. Public link and receipt pages

Generally the best copy in the product: short and specific.

- "For your receipt and updates only." Good. Consider adding "Never shared beyond {receiver}".
- "No preview in this browser. The upload still works." Good.
- "Link not recognised" / "This link stays the same. Check back soon." Good.
- Receipt: "Files are deleted within 90 days of delivery unless {receiver} keeps them." Accurate, but "could be better" tracks go at +30 days from marking, which may be earlier; "within 90 days" still holds. Fine.
- "+ Add a message or release status (optional)": "(optional)" is redundant with "+ Add". Cut it.

## 5. Emails

The plain-text emails are clear and honest. Keep the structure.

| Email | Verdict | Change |
| --- | --- | --- |
| Delivered (sender) | Good | Move the confirm-email line above the receipt link: it's the one action we need. |
| Listened (sender) | Excellent. The disclaimer is the brand. | "It doesn't say anything about whether it'll be played out." → "It doesn't tell you whether it'll be played out." |
| Downloaded (sender) | Good | Add one line: "Downloading usually means they want it on hand, but it isn't a promise." |
| Reply (sender) | Good | Subject is right. Consider reply-to = receiver's email only if the receiver opts in. |
| New track (receiver) | Good | Subject: "New track: Artist – Title" ✔. |
| Digest (receiver) | Good | "Start listening" ✔. |
| Link paused (receiver) | Needs care | "Delete tracks or upgrade to reopen it" → during beta plan switching is free, so: "Your desk holds 20 active tracks on Free. Clear some, or move to Pro (free during the beta), to reopen it." |
| Password reset | Good | |
| Referral earned | | "You earned 10 more song slots" → "You both got 10 more track slots". |
| **Missing: welcome email** | | After sign-up, send one: your link, how to share it, the three keys (Space, K, X). Draft in [launch-emails.md](launch-emails.md). |

## 6. Invite message (share sheet)

Current: title "Join me on FloorTest", text "Get a permanent link for demo submissions."

Suggested: "I use FloorTest for demos: one link, every track in one place, and senders get told when you've listened. Here's an invite:" (the link follows). Sounds like a DJ passing on a tip.

## 7. Launch emails and social posts

Nothing existed yet, so drafts are in [launch-emails.md](launch-emails.md), written to the voice guide.
