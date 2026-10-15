# Grouped audit, 15 Oct 2026

Owner's "go" on three checks: what's waiting on preview, a design pass against rule 15 ("No AI Slop"), and email previews against what gets sent. Run by the General review session; Preview site and Product review sessions confirmed no overlap.

**Build audited:** production `28b9d5b` (code identical to preview `b0cc114`). **Fixes:** branch `audit-fixes-15oct`, on preview, not shipped.

## 1. What's waiting on preview

Preview is 130 commits ahead of production, but **no code differs**: every change was already shipped on its own, and the gap is merge history plus 20 document files (working rules 12–15, `CLAUDE.md`, evidence reports, the lawyer brief and its Word copy, the receipt motion loop's source files, cost and finance notes).

**Release proposal:** one docs-only release, so the new rules in `CLAUDE.md` reach cloud sessions (they start from `main`), together with this audit's fixes below once reviewed.

## 2. Design pass ("No AI Slop")

Every page was loaded in a real browser, signed in as the seed receiver, at 1024 px (desktop) and 375 px (phone emulation, not a real phone), and measured.

| Page | Pills | Coloured shadows | Random gradients | Sideways scroll | Unlabelled controls | Duplicate actions | Result |
|---|---|---|---|---|---|---|---|
| Floor, Review Queue, Collections, Prepare, Contacts, Activity, Account | 0 | 0 | 0 (the sidebar's two-tone "tactile" panel is the design system) | none | 0 | none | passed |
| Link page `/maxwell` | 0 | 0 | 0 | none | 0 | none | passed |
| Receipt | 0 | 0 | 0 | none | 0 (one flag was a link inside the folded Details) | none | passed |
| Trust | 0 | 0 | 0 | none | 0 | none | passed |
| Pricing | 0 | 0 | 0 | none | 0 | "Open your desk" once per plan, expected | passed after fix |
| Home | 0 | lime cue lamp in the deck drawing, intended | drawings only | none | 0 | header/footer repeats, expected | passed after fix |

Heading sizes follow `DESIGN.md`: 28 px page titles, 32 px only for the Floor greeting; the home headline (77 px desktop, 48 px phone) is the approved 14 Oct home. Text under 11 px appears only inside the home page's product drawings, which are hidden from screen readers.

**Defect found and fixed:** two standalone links below the 24 px touch-target minimum (WCAG 2.2, 2.5.8).

| Link | Before | After | Text moved? |
|---|---|---|---|
| Home "See an example /maxwell", desktop and phone | 20 px | 24 px | no (gap to the element above unchanged: −35 px desktop, 25 px phone) |
| Pricing "← Back to home", desktop and phone | 16 px | 24 px | no (32 px below the block, before and after) |

Renders beside this report: `2026-10-15-audit-{before,after}-{home,pricing}-{desktop,phone}.png`. Before = production code on local data; after = the fix branch on e2e test data (same layout, different sample text).

Not covered: the ops editor (needs the owner's ops sign-in), a real phone, and a screen-reader pass (still on the plan before public launch).

## 3. Email previews against what's sent

All mail goes out as plain text (`src/lib/mail.ts` → Resend `text`), so there's no hidden layout. The 11 editable emails (`src/lib/email-copy.ts`) use the same wording and fill-ins in the editor preview, the test send and the real send.

| Check | Result |
|---|---|
| Wording and fill-ins: preview vs send | passed (same `fillEmail` on the same saved text) |
| "Stop these emails" line on the two optional emails (first-track nudge, played-out reminder) | **failed → fixed**: the send added it, the preview didn't. Now marked once in `EMAILS` (`unsubscribe: "alerts"`); both senders read that mark and the preview shows the line |
| Subject spacing tidied at send but not in preview | fixed: preview tidies the same way |
| Emails outside the editor | ~28 (sign-in codes, password and email changes, security alerts, team invites, stems, digests) keep wording in code on purpose; not previewable in ops. Noted, not changed |

## Checks on the fix branch

| Check | Result |
|---|---|
| Typecheck, lint | passed |
| `check:perms` (incl. RLS on all 60 tables) | passed |
| Unit tests, 103 files | passed |
| End-to-end, 40 tests | passed |
| Before/after renders and touch-target sizes | passed |

## Status

- Built and tested: the two touch targets and the email preview fix (preview only).
- Live: nothing new from this audit yet.
- Unfinished: real-phone check, screen-reader pass, load test, the ops editor walk (owner sign-in).

**Next:** review on preview, then ship as one release with the docs.
