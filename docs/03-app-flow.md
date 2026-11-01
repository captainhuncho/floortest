# 03 · App flow

What happens when someone clicks, and which page comes next. Change a route or redirect → update this file in the same commit.

## Visitor (site gated until launch)
```
floortest.app ──(no gate pass)──► /coming-soon ──password──► the page they wanted
                                     ├─ Join the waitlist ──► pop-up (email, name, role, link wanted) ──► waitlist (Ops → Waitlist)
                                     └─ Sign in ──► /login
beta invite email ──► /signup?invite=CODE ──► /invite/CODE ──live personal invite──► gate pass + /signup (invite shown)
                                                          └─ wrong, used, revoked, shared code, or 20 tries in 10 min ──► /coming-soon
Nothing about FloorTest is public before launch (legal pages too); the gate shows only "Coming soon". A personal
invite stops opening it once its email has an account (owner, 29 Oct); team invites open it the same way via /join.
The invite's pass lasts one day (signing up or in gives the usual 30), and only codes made since 29 Oct (FLOOR- plus 10
characters) open it: an older invite still signs up with the password, or Ops resends it, which swaps in a new code.
On /signup a wrong invite code counts: 5 an hour per email, 20 an hour per connection, then "Too many tries".
```

## Receiver: sign-up
```
/signup ─┬─ one question per screen (owner, 31 Oct; ?step= in the URL, so the phone's Back works):
         │   1 welcome: Claim your link → / I already have one (no invite: Join the waitlist →)
         │   2 first name, surname ─► 3 username (live check, checkHandle) ─► 4 account type (tap rows)
         │   5 email (locked to the invite's), password, 18+/Terms, optional emails ─► Create my link
         │   (answers kept in memory and sessionStorage, never the password; one post of the same signup action;
         │    a server answer reopens the step with the wrong field, the "couldn't create" answer stays on 5)
         │     ├─ ok ──► /signup/ready: 6 check your email (the link; carry on) ─► 7 add a photo (POST /api/cover,
         │     │         or Skip) ─► 8 your link is ready (Copy / Share) ─► /dashboard/floor?welcome=1
         │     │         (6 is skipped when the invite already proved the email; a share link's landing still wins)
         │     └─ email already used ──► neutral error; owner gets a quiet email
         └─ Sign up with Google ──► Google ──► /api/auth/google/callback
                 ├─ no account ──► /signup/google (details, Terms)* ──► Floor
                 └─ account exists ──► sign-in path below
* while switch open_signup is off, only a personal Ops invite opens an account: the sign-up link in the invite email, with the email it went to (no code to type; the link carries it, and it confirms the email). Without the link, or with another email, sign-up says it's invite-only. Google sign-up with that email needs no link (Google proved the email); "No invite? Join the waitlist" ──► /#waitlist
```
A new desk has no collection (owner, 15 Oct), and its link is open anyway: tracks sent to it land straight in the Review Queue, unsorted (`tracks.collection_id` empty; intake only refuses a paused link, a closed or full collection, or a full desk). The Floor's Your link says "Sends tracks to your Review Queue", the checklist suggests a collection for the callout (a brief and a closing date), and Account's routing menu shows "Review Queue (no collection)". Making a collection ("Send new tracks here now", on by default) points the link at it; from then on a closed collection stops uploads as before.

## Receiver: sign-in
```
/login ─┬─ email + password ──► (two-factor on?) /login/verify (code, recovery code, or "Use a passkey instead") ──► Floor
        │     after 3 wrong tries (15 min, per account or connection): Cloudflare human check appears and is required
        │     20 wrong from one connection, or 10 for one email from one connection (15 min) ──► "Too many attempts"
        ├─ Sign in with a passkey ──► the device asks for face, fingerprint or PIN ──► Floor (no code step: the passkey is both)
        ├─ Email me a sign-in code ──► /login/code ──► /login/code/enter ──► Floor
        ├─ Forgot your password? ──► /forgot ──► "If that address has an account…" ──► email ──► /reset/<token> ──► Floor
        └─ Continue with Google ──► Google ──► callback
              ├─ Google account pinned to an account ──► (two-factor?) ──► Floor
              ├─ same email, not yet pinned ──► /login/google (FloorTest password) ──► pinned ──► Floor
              ├─ unconfirmed account / different Google account / not Gmail-Workspace ──► /login?google=<reason>
              └─ no account ──► /signup/google
A collection shared with your account (/c/a.<n>) remembers itself and is where sign-in lands.
Passkeys: Settings → Security → Add a passkey ──► password (+ two-step code if on) ──► the browser saves it ──► email "A passkey was added". Remove… ──► "First, confirm it's you" (password + two-step code if on) ──► Remove ──► email. Website only; hidden in the apps.
Settings → Security, "confirm it's you" form (opens under the button; Cancel closes it; a wrong password or code shows there):
   Remove a passkey · Sign out other devices (also ends ops sessions) · turn Sign-in alerts off ──► password (+ two-step code if on) ──► done
   Turning alerts on needs nothing. Turning two-step on, adding a passkey or changing the email waits for a confirmed email.
The ticket between the password (or email code, reset link, Google) and /login/verify is one-time and lasts 5 minutes; after it, sign in again.
```

## Receiver: daily loop
```
Floor (waiting count ─► Start with the oldest; Up next rows open the track) ─► Queue (phones: the open track as a card above the list, ‹ › or a sideways swipe to the next one) ─► play ─► Keep (K) ──► Prepare ─► Download kept ─► name folder ─► ZIP
                              ├─ Not for me (X)    └─ Files only · Start a new batch (confirm) · Played it out (any day)
                              └─ Reply (R) ──► sender email
Review panel: title · one meta line · tags (sets / release / AI / duplicate / deleting soon) ─► waveform (1–4 jump) ─► Keep · Not for me · Reply ─► next track plays
   While a track is open, the next and previous tracks load in full in the background (DecisionRail), so moving to them shows their details at once; a decision refreshes them. Keep / Not for me move to the next track's page first and save after, so the save's answer carries that page (one trip to the server, not two); the decided track stays out of the list until the save answers
   Details (closed, remembered) ─► format & size · dates · Download · Move · Delete (confirm) · sender email, links, stats, note, last 3 events · Full history →
Queue (List) ─► Select ─► tick tracks / Select all ─► bar: Keep · Not for me · Needs review · Move to… · Download · Delete ─► confirm ─► done (toast)
   Esc or Done leaves select mode; in select mode a tap on a row ticks it (never plays or opens it)
Floor ─► Collections ─► New collection / Open collection ─► Add tracks (owner: choose WAV/MP3s, edit titles, rights tick, upload) ─► Edit collection · Download collection · Files only · Send new tracks here
Nightly, only if Settings → Receiving → "When a callout closes" is on ─► a link on a collection past its close date ─► moves to the newest open collection ─► email to the receiver · bell: "Your link now goes to …" · activity: "Link moved on its own to"
Floor ─► Send ─► their-link ─► upload ─► Sent list (≤10 days open, older folded) ─► Track → /receipt/<token>
Avatar ─► Account ─► Settings (profile, receiving, notifications, plan, security) · Sign out ─► /signed-out
```
Mobile tab bar: Floor · Queue · Collections · Prepare. Desktop sidebar adds Send, Contacts, Activity.

## Plans
```
/dashboard/plans ─► choose plan
   ├─ billing switch off (beta) ─► /dashboard/plans/request ─► ops approves/declines ─► email
   └─ billing on (after beta) ─► /dashboard/checkout ─► paid (Paddle, to build)
```

## Sender
```
floortest.app/<handle> ─► choose files (or Send folders on Pro/Team)
   ─► details form (title/artist · you · about the track; "+ Add a message" / "+ Add artwork" on Team) ─► email ─► 6-digit code
   ─► upload in place (one bar, time left, Cancel; a dropped or stalled upload (no progress for 30 s) is tried again by itself up to 3 times once the phone is back online, from the start of that file with the same 15-minute link, saying so on screen; after that "The upload stalled…" / "Network error…" with the answers kept) ─► done: check, receipt email, Delivered → Listened → Downloaded → Replied ─► View receipt / Send another. Several tracks in one send: each track is saved and waits (`tracks.receipt_due_at`); the request that saves the send's last track (the browser sends `send_size`) queues one "Delivered" email listing them all, each with its receipt link, and one "New tracks" email to the receiver, in the same transaction; if the rest never come (a refusal, Cancel, a closed tab), the 10-minute mail job sends what arrived 15 minutes after the latest track. A held track that arrives after its send's email gets its own. If the virus scanner is asleep or down (hold and scan, 26 Oct): done says "“Title” is received", it's being checked for viruses (up to 10 minutes), the receipt follows by email; no View receipt yet, artwork isn't attached; the 10-minute batch delivers it (or emails the sender if it's refused). A save that fails for any reason other than a refusal (database or storage hiccup) keeps the file; the sender's retry or the next batch finishes it
   Missing answers: each field says what to do and they're listed together above Send (each a link); nothing uploads until they're filled.
   The code email: tried twice; if it still doesn't go, the code screen says so ("didn't go through", or "bounced before" for an
   address that bounced) instead of waiting for an email that never comes (report, 29 Oct).
   A genre tapped in the receiver's brief arrives already chosen in the form.
Link closed / paused / full ─► the page says why, no upload ─► "Email me when it reopens" ─► one email when the link takes uploads again
   (after the receiver switches collection, moves the closing date or resumes: up to 50 sent just after the page answers, the rest nightly; nightly also for a pause that ended on its own or a re-route; a failed send is retried by the email queue every 10 minutes)

Receiver emails ─► instant "New track" (sent at once, one per send: a send of several is one "New tracks" email listing them; quiet hours hold it for the digest; the bell also shows a send as one row) · daily digest, 2-week nudge, first-track nudge, Played out reminder (written at 08:00 UTC, sent by the 10-minute email queue) ─► a failed send is retried with the same key, never sent twice ─► near the daily send limit these wait until after midnight UTC; sign-in codes, resets and receipts always go
```

## Offline kept tracks (iPhone and Android apps)
```
Prepare ─► Save for offline ─► "Save on this phone" ─► kept tracks download (Saving… n of N) ─► "N tracks on this phone"
Every later visit to Prepare ─► phone copy brought in line (new keeps saved, cleared/deleted tracks removed)
No connection ─► "You're offline" + SAVED ON THIS PHONE ─► tap to play (next plays on; lock screen / notification controls)
   signal returns mid-track ─► keeps playing (only an idle screen returns to the desk)
Remove from phone · sign out / reach sign-in · another account syncs · 30 days without opening Prepare online ─► copy wiped
```

## Share to FloorTest (iPhone and Android apps)
```
Files / Dropbox / WeTransfer … ─► Share ─► FloorTest ─► file copied into the app's inbox ─► app opens on Send
   ─► "Shared to FloorTest" box ─► type their link name ─► the file is already in the form ─► usual send
Not WAV/MP3 ─► "FloorTest takes WAV and MP3 files." · Remove ─► inbox cleared · sent ─► inbox cleared · unsent files clear after a day
```

## Editing the site (ops staff with Site content)
```
ops → Site content → Edit on the page ↗ ─► 60-second pass ─► floortest.app/<page> in draft + edit mode
   ├─ click text ─► type          ├─ click a list ─► panel ─► Apply
   ├─ text picked (tap, click or Tab) ─► size picker under it: Smaller · Default · Larger · Largest
   │     (Esc in the text jumps to the picker and back; a list's panel has the same Size row)
   ├─ click product image ─► choose file (resized to WebP)
   ├─ section bar, always shown above each home section in edit mode (no hover): drag ⠿ / ↑ ↓ / Hide · Show, 44px buttons
   └─ toolbar: Save draft · Publish (live + version) · Exit (ends preview, back to ops)
Sizes save as the page's `sizes` field ("headline:lg,faq:sm"); the server keeps only the fixed steps (sm, lg, xl) for that page's own text fields and drops anything else (`cleanField`, src/lib/content-fields.ts). The public page shows them too.
Edit mode is bound to the exact ops session that opened it (pass and cookie are signed with its token hash, 1-hour cookie): signing out of ops or that session timing out ends it at once. Saves 120/hour and uploads 30/hour per person; every draft save and publish is in the admin log.
```

## Ops (ops.floortest.app)
```
/ops-login (password + two-factor every time) ─► /admin (Overview: verdict, act now, queues, health)
   top bar: Overview · Support · Growth · Product · Trust & safety · Platform · Admin (picks the area)
   sidebar: Essentials (Overview, Inbox, Users, Moderation) + the open area's pages
   each page needs its permission, else ─► /admin/no-access
   phones: bottom bar Home · Inbox · Users · Safety · More (More ─► full menu)
Users ─► Filters (type, plan, tag, joined, activity, security) ─► chips (✕ removes one) ─► 50 a page
   tick rows (≤ 50) ─┬─ Add tag ─► tag added to each ─► admin log
                     └─ Suspend… (≤ 20) ─► reason ─► each: signed out, link offline, email with appeal ─► admin log
Growth ─► Growth & decisions ─► findings · funnel · projection · sources · cohorts · pipeline
Moderation ─► search ─► pick a track ─► Play, only with an open takedown claim (5-minute file link; admin log "played track"; otherwise 404 + "refused play")
Queue buttons (Inbox handled/reopen, Verification approve/not yet, Plan request approve/decline, Incident handled)
   ─► the action answers in place (src/lib/ops-result.ts, OpsForm): no reload, buttons locked while it
   works, success in the toast, a refusal under the form
   ─► Block sender for @them / Block everywhere / Remove track… (confirm)
```

## Collection share links (switch `sharing`; off on the live site)
```
Owner: collection page ─► Share links ─► New share link ─► address shown once ─► Add people (email / @company.com / @username)
Recipient: /c/<id> ─► signed in with a confirmed email? ─┬─ yes ───────────────────────────────┐
                                                        └─ no ─► email ─► 6-digit code (10 min) ┤
   on the list? ─► access notice ─► tick ─► the collection (listen; download if allowed), 12 h ─┘
   not on it ──► ask to join (name, note) ─► owner: bell + grouped email (≤ 1 an hour)
                    ─► Approve (permission, days) / Decline / Block ─► requester emailed ─► opens the link again
Reset ─► new address, every session on the old one ends · Revoke ─► link gone · Remove person (confirm) ─► their sessions end
Account added by @username ─► email + bell ─► Collections → Shared with you to listen ─► /c/a.<n> (signed in) ─► notice ─► listen
   signed out ─► "Log in to open" ─► /login ─► back to /c/a.<n> · signing out ends the visit
Owner bell: first visit by each person · downloads · "may have your link" (10+ unknown addresses in an hour; emailed) · requests paused
```

## Account teams (switch `teams`; off on the live site, where teams work only on an ops super-admin's desk for the owner's testing)
```
Owner/Admin: Settings → Team ─► Invite (email, role) ─► email with /join/<invite> (7 days)
Invitee ─► /join/<invite> ─┬─ signed in with that email ─► Join ─► team desk opens
                           ├─ signed out ─► Log in (comes back) / Create your login, with a password or Google (no invite code: the invite is remembered for an hour in `ft_team_invite`, and Google sign-up also finds a live invite sent to that Google-confirmed email, whichever button they started from) ─► joined
                           └─ other email ─► "sent to …, log in with that email"
Desk bar ─► Switch desk ─► your own desk | each team (role shown)
Lost the team desk (removed, seat paused, teams off, account suspended) ─► pages show your own desk
   a change made from the old desk ─► refused ─► your own Floor with "You don't have access to that team's desk any more, so nothing was changed" (?desk=ended)
Member reply ─► approval off ─► sent │ approval on ─► held ─► approver / owner / admin: edit ─► Approve and send | Don't send
Member Keep / Not for me on an owner's or admin's call ─► refused (desk refreshes); owner/admin can change anyone's
Owner-only or admin-only page as a member ─► Settings → Team (?denied)
```

## Email links and errors (owner, 31 Oct)
```
Email link ─► page with one message and one action
   valid ─► the step (Confirm my email | Confirm new email | Unsubscribe | Join … | Email me a code) ─► done page
   signed in as someone else ─► "Sign in to confirm" | invite: Sign out, then open the invite again
   invalid, expired, used or switched off ─► one answer ("Link not recognised" / "That link didn't work" / "This link isn't available")
Page fails ─► public page: "This page didn't load" ─► Try again | Go to FloorTest
            desk page: same message inside the desk menu ─► Try again | Back to the Floor
            after an update: reloads once by itself, then "FloorTest was just updated" ─► Reload
            root layout fails: global-error ─► Reload
No such page ─► "Nothing on this link" (Go to FloorTest | Your desk) · desk: "Nothing here" (Back to the Floor) · receipt: Email me my sends
```
