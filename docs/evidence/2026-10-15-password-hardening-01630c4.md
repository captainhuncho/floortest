# Password hardening, 15 Oct 2026

**Build:** production `01630c4` (deployment `dpl_4FsimVyYeux7SB296RosPEHFGxzU`, READY; rebuilt once on the same commit after `dpl_EeYMSgy8q7HMHdg9GhRBqWNrj259`). Preview `e913323` at ship time.

**What shipped**
- `04898b8` Password hashing at OWASP's scrypt minimum (N=2^15, r=8, p=3), async, older hashes upgraded at the next sign-in on web, app and ops; new passwords refused if Have I Been Pwned lists them (k-anonymity, 5 hex characters of the SHA-1 leave the server; fails open).
- `01630c4` Docs only: plan Done list restored after a bad conflict resolution.
- Shipped alongside, by the Security session the same day (`f2904ab`): `__Host-` session cookie, device label and last-used per session (migration 0095_session_devices), 14-day idle sign-out, devices list.

**Checks**

| Check | Build | Result |
|---|---|---|
| Typecheck, lint | 01630c4 | passed |
| `check:perms` (ops, desk roles, RLS on all 60 tables) | 01630c4 | passed |
| Unit tests, 102 files (incl. `password-hash`, `breached`) | 01630c4 | passed |
| End-to-end, 40 tests | 01630c4 | passed |
| Hash upgrade at sign-in (e2e accounts seeded in the old format) | 320c643 | passed: 8 of 8 accounts in the new format after the run |
| Leak check against the live Have I Been Pwned service | 320c643 (local) | passed: a common password found 2,266,543 times, an unusual phrase 0 |
| Production deploy READY, health `{"ok":true}` | 01630c4 | passed |
| Production runtime errors, 24 h after ship | 01630c4 | passed: none |
| Leak check and hash upgrade on the live site | 01630c4 | blocked: needs a real sign-up or sign-in on production; the first real one exercises them |

**Status**
- Built, tested and live: everything above.
- Unfinished: lawyer questions 40–41 (leak check, devices list); Vercel Pro firewall rate rule before launch.

**Rollback:** last deployment before this ship is `f2904ab`. **Not a clean rollback for passwords:** anyone who signs in after 15 Oct 11:36 UTC has their hash rewritten in the new `scrypt$15$8$3$…` format, which the code before `04898b8` can't read; after a rollback they couldn't sign in until a password reset. Roll back only together with a forward fix that keeps `src/lib/password-hash.ts`.

**Next:** watch Vercel's runtime logs after the first real sign-ins and sign-ups for `[breached] check skipped` or `[auth] password hash upgrade failed`.
