# 03 · App flow

What happens when someone clicks, and which page comes next. Change a route or redirect → update this file in the same commit.

## Visitor (site gated until launch)
```
floortest.app ──(no gate pass)──► /coming-soon ──password──► the page they wanted
                                     └─ Sign in ──► /login
Nothing about FloorTest is public before launch (legal pages too); the gate shows only "Coming soon".
```

## Receiver: sign-up
```
/signup ─┬─ form (type, names, username, email, password, Terms; a missing field is pointed at, one at a time)
         │     ├─ ok ──► /dashboard/floor?welcome=1 (+ confirm-email email)
         │     └─ email already used ──► neutral error; owner gets a quiet email
         └─ Sign up with Google ──► Google ──► /api/auth/google/callback
                 ├─ no account ──► /signup/google (details, Terms)* ──► Floor
                 └─ account exists ──► sign-in path below
* while switch open_signup is off, only a personal Ops invite to that exact email opens an account (no code to type; the invite link's code rides along); "No invite? Join the waitlist" ──► /#waitlist
```
A new desk has no collection (owner, 15 Oct), and its link is open anyway: tracks sent to it land straight in the Review Queue, unsorted (`tracks.collection_id` empty; intake only refuses a paused link, a closed or full collection, or a full desk). The Floor's Your link says "Sends tracks to your Review Queue", the checklist suggests a collection for the callout (a brief and a closing date), and Account's routing menu shows "Review Queue (no collection)". Making a collection ("Send new tracks here now", on by default) points the link at it; from then on a closed collection stops uploads as before.

## Receiver: sign-in
```
/login ─┬─ email + password ──► (two-factor on?) /login/verify ──► Floor
        │     after 3 wrong tries (15 min, per account or connection): Cloudflare human check appears and is required
        ├─ Email me a sign-in code ──► /login/code ──► /login/code/enter ──► Floor
        ├─ Forgot your password? ──► /forgot ──► "If that address has an account…" ──► email ──► /reset/<token> ──► Floor
        └─ Continue with Google ──► Google ──► callback
              ├─ Google account pinned to an account ──► (two-factor?) ──► Floor
              ├─ same email, not yet pinned ──► /login/google (FloorTest password) ──► pinned ──► Floor
              ├─ unconfirmed account / different Google account / not Gmail-Workspace ──► /login?google=<reason>
              └─ no account ──► /signup/google
A collection shared with your account (/c/a.<n>) remembers itself and is where sign-in lands.
```

## Receiver: daily loop
```
Floor (waiting count ─► Start with the oldest; Up next rows open the track) ─► Queue (phones: list first; a track opens with the rail docked at the bottom) ─► play ─► Keep (K) ──► Prepare ─► Download kept ─► name folder ─► ZIP
                              ├─ Not for me (X)    └─ Files only · Start a new batch (confirm) · Played it out (any day)
                              └─ Reply (R) ──► sender email
Review panel: title · one meta line · tags (sets / release / AI / duplicate / deleting soon) ─► waveform (1–4 jump) ─► Keep · Not for me · Reply ─► next track plays
   While a track is open, the next and previous tracks load in full in the background (DecisionRail), so moving to them shows their details at once; a decision refreshes them
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
   ─► upload in place (one bar, time left, Cancel; a dropped or stalled upload (no progress for 30 s) is tried again by itself up to 3 times once the phone is back online, from the start of that file with the same 15-minute link, saying so on screen; after that "The upload stalled…" / "Network error…" with the answers kept) ─► done: check, receipt email, Delivered → Listened → Downloaded → Replied ─► View receipt / Send another. If the virus scanner is asleep or down (hold and scan, 26 Oct): done says "“Title” is received", it's being checked for viruses (up to 10 minutes), the receipt follows by email; no View receipt yet, artwork isn't attached; the 10-minute batch delivers it (or emails the sender if it's refused). A save that fails for any reason other than a refusal (database or storage hiccup) keeps the file; the sender's retry or the next batch finishes it
   Missing answers: each field says what to do and they're listed together above Send (each a link); nothing uploads until they're filled.
   A genre tapped in the receiver's brief arrives already chosen in the form.
Link closed / paused / full ─► the page says why, no upload ─► "Email me when it reopens" ─► one email when the link takes uploads again
   (after the receiver switches collection, moves the closing date or resumes: up to 50 sent just after the page answers, the rest nightly; nightly also for a pause that ended on its own or a re-route; a failed send is retried by the email queue every 10 minutes)

Receiver emails ─► instant "New track" (sent at once; quiet hours hold it for the digest) · daily digest, 2-week nudge, first-track nudge, Played out reminder (written at 08:00 UTC, sent by the 10-minute email queue) ─► a failed send is retried with the same key, never sent twice ─► near the daily send limit these wait until after midnight UTC; sign-in codes, resets and receipts always go
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
   ├─ click product image ─► choose file (resized to WebP)
   ├─ section bar: drag ⠿ / ↑ ↓ / Hide · Show
   └─ toolbar: Save draft · Publish (live + version) · Exit (ends preview, back to ops)
Edit mode is bound to the exact ops session that opened it (pass and cookie are signed with its token hash, 1-hour cookie): signing out of ops or that session timing out ends it at once. Saves 120/hour and uploads 30/hour per person; every draft save and publish is in the admin log.
```

## Ops (ops.floortest.app)
```
/ops-login (password + two-factor every time) ─► /admin (Overview: verdict, act now, queues, health)
   sidebar: Overview · Support · Growth · Product · Trust & safety · Platform · Admin
   each page needs its permission, else ─► /admin/no-access
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
Member reply ─► approval off ─► sent │ approval on ─► held ─► approver / owner / admin: edit ─► Approve and send | Don't send
Member Keep / Not for me on an owner's or admin's call ─► refused (desk refreshes); owner/admin can change anyone's
Owner-only or admin-only page as a member ─► Settings → Team (?denied)
```

