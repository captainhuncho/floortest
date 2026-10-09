# 03 · App flow

What happens when someone clicks, and which page comes next. Change a route or redirect → update this file in the same commit.

## Visitor (site gated until launch)
```
floortest.app ──(no gate pass)──► /coming-soon ──password──► the page they wanted
                                     ├─ Sign in ──► /login
                                     └─ Privacy · Terms · Cookies (always public)
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

## Ops (ops.floortest.app)
```
/ops-login (password + two-factor every time) ─► /admin (Overview: verdict, act now, queues, health)
   sidebar: Overview · Support · Growth · Product · Trust & safety · Platform · Admin
   each page needs its permission, else ─► /admin/no-access
```
