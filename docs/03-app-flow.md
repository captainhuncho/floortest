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
/signup ─┬─ form (invite code*, type, names, username, email, password, Terms)
         │     ├─ ok ──► /dashboard/floor?welcome=1 (+ confirm-email email)
         │     └─ email already used ──► neutral error; owner gets a quiet email
         └─ Sign up with Google ──► Google ──► /api/auth/google/callback
                 ├─ no account ──► /signup/google (invite code*, details, Terms) ──► Floor
                 └─ account exists ──► sign-in path below
* invite code only while switch open_signup is off; "No code? Join the waitlist" ──► /#waitlist
```

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
A share link (/s/…) remembers itself and is where sign-in lands.
```

## Receiver: daily loop
```
Floor ─► Review Queue ─► play ─► Keep (K) ──► Prepare for set ─► Download kept ─► name folder ─► ZIP
                              ├─ Not for me (X)    └─ Files only · Clear kept (confirm)
                              └─ Reply (R) ──► sender email
Floor ─► Collections ─► New collection / Open collection ─► Edit collection · Download collection · Files only · Send new tracks here
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
   ─► details form (+ Artwork on Team) ─► email ─► 6-digit code ─► upload (progress, cancel)
   ─► "Sent" screen ─► receipt email ─► /receipt/<token> (status updates by email)
Link closed / paused / full ─► the page says why, no upload.
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
