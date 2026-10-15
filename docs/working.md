# The working council

How FloorTest gets built day to day: sessions, branches, checks, shipping, docs and what waits on the owner. The product panel (`docs/06-plan.md`, team decisions) argues what to build; the finance panel (`finance.md`) argues money; this council argues how the work runs. Started 14 Oct 2026.

## The council

| Voice | Looks after |
|---|---|
| Release manager | `mobile-next` vs `main`, what is held on preview, ship branches, the spaced pushes |
| Session coordinator | Parallel Claude sessions, worktrees, who owns which branch, nothing left half-merged |
| QA | `typecheck`, `lint`, `test`, `check:perms`, e2e, real-device and email-client checks |
| Docs keeper | Docs move in the same commit as the change; `06-plan.md` Done stays honest |
| Ops on call | Production health, incidents, the runbooks in `operations.md` |
| Owner's time | What only the owner can do, batched so it fits a phone review |
| Scope guard | The beta dates, the launch gate, saying no to work that doesn't serve them |

Same format as the other panels: one or two lines per voice, one recommendation, open points to the owner as numbered questions, outcome recorded here.

## Standing rules (from the owner, kept here in one place)

1. New work goes to `mobile-next`; the owner reviews the Vercel preview link on the phone.
2. Only the session the owner says "ship it" to touches `main`. A ship branch starts from `main`, never from `mobile-next`.
3. Fixes that must reach production are built on a branch from `main`, then merged into `mobile-next`.
4. Ship: push `main`, wait ~60 s, push `mobile-next`, confirm the deploy.
5. Checks before every push; e2e when sending, review, downloads, receipts or auth change.
6. Several sessions share one checkout: commit only your own changes, leave the rest.
7. Secrets, deletions, sign-ins, dashboard settings and legal wording are the owner's.
8. Before shipping, check what `main` already has: another session may have shipped it (14 Oct: batches 1–4 and the home went out from one session while another was building the same ship).
9. Before editing, confirm which checkout you're in (`git rev-parse --show-toplevel`); never edit the shared checkout while another session has uncommitted work there.
10. Don't delete branches, local or on GitHub, unless the owner asks, even merged ones.
11. "Optimise all the work I give you" (owner, 15 Oct): find out what can be found out before asking, and batch the few real asks into one message; prefer known, repeatable steps over guessing; exact-string edits (not perl or sed substitutions) on files with `|`, `$`, `#` or backticks, and no merge markers in any commit; one branch per deliverable from `main`, checks once, one merge to preview; reports lead with the outcome, numbers in a table, the next step in one line.
12. The owner's twelve working principles (15 Oct), for every session:
    1. **Understand before building:** read the latest code, the live product and earlier decisions; research existing services and official docs before choosing an approach.
    2. **Preserve working features:** extend the project; protect saved data, integrations and approved designs; database changes backward-compatible, with a recovery path.
    3. **Build complete workflows:** a screen or button isn't a feature; connect interface, API, database, permissions, errors and recovery, and test the whole journey.
    4. **Keep the experience simple:** compact and easy for customers and staff; plain language, consistent layouts, accessible controls; no generic dashboard styling or clutter.
    5. **Use the simplest reliable solution:** established tools and native features; no unneeded dependencies, duplicated systems or architecture without a shown need.
    6. **Protect data and access:** validate requests and enforce permissions on the server; no duplicate charges or rewards; protect credentials; keep each user's records separate.
    7. **Measure performance:** loading, response times, resource use, realistic demand; optimise measured problems; no speed or capacity claims without evidence.
    8. **Verify actual behaviour:** automated checks, independent review, real browser tests; test failures, retries, reloads, interrupted work and recovery; screenshots alone don't prove it works.
    9. **Keep testing evidence:** every report names the exact build (commit) and marks each check passed, failed or blocked; reports and screenshots saved together and reviewed before the next changes.
    10. **Work efficiently:** cloud development by default, local browser or device evidence when needed; each worker owns clear areas so edits don't clash; test the affected areas, not unrelated checks over and over.
    11. **Deliver substantial improvements:** one completion checklist (`docs/06-plan.md`); group related work into meaningful releases rather than endless small updates; fix defects found on the way; approval-dependent connections stay off until authorised.
    12. **Publish safely and report honestly:** verify the published build before calling anything complete; keep a compatible rollback path; say plainly what's built, tested, live and unfinished; short, accurate, easy reports.
13. How principles 9–11 run in practice (owner, 15 Oct: "all three, optimisation and efficiency is key"):
    - **Evidence:** every ship gets one report in `docs/evidence/` (format in its README): the exact commit, each check marked passed, failed or blocked, and what's built, tested, live and unfinished. Screenshots sit beside it, small (PNG or JPG, under 300 KB each).
    - **Cloud first:** new work starts in a cloud session; this Mac is for browser and device checks (simulator, the owner's phone, local data) and for work that needs local tools. A session that can't reach the internet says so rather than guessing.
    - **Grouped releases:** at most one production release a day, grouped from what's reviewed on preview and named in the plan. Fixes for security, data loss or the site being down ship any time. Every release still follows rules 2–5, 8–10 and the session check-in before `main` is touched.
14. The owner's skill areas (15 Oct), how each is done here, and the installed skills that carry it. Load the skill before doing that kind of work.

    | Area | How it's done here | Skills |
    |---|---|---|
    | Product design | Compact, consistent, easy; each product keeps its own identity (FloorTest per `DESIGN.md`, `docs/04-design.md`) | `impeccable`, `emil-design-eng`, `apple-design`, `design:design-critique`, `design-skills:*` |
    | Production audits | Security, permissions, payments, data recovery, accessibility, whole journeys; fix defects and retest | `security-review`, `ponytail-audit`, `ponytail-review`, `code-review`, `design:accessibility-review`, `backend-design:audit` |
    | Deployment and recovery | Releases, database changes, live checks, rollback; confirm which build is actually running (deployment ID and commit) | `shipping-and-launch`, `deprecation-and-migration`, `backend-design:review-migration`, Vercel tools |
    | Performance and simplification | Find unneeded code, dependencies and resource use; measure the bottleneck before optimising | `cloudflare:web-perf`, `ponytail-debt`, `simplify`, `backend-design:hunt-n-plus-one` |
    | Government-system planning | Institutional responsibilities, legal approvals, data ownership, service delivery, rollout (other projects; not FloorTest) | `deep-research`, `operations:*`, `legal:*` |
    | Email | Keep the approved layout, branding and tone (`src/lib/email-copy.ts`, `docs/brand-voice.md`); the email editor's preview in ops (Admin → Content) must match what actually gets sent, checked against Admin → Emails, the log of sent mail | `resend:react-email`, `resend:email-best-practices`, `brand-voice:enforce-voice` |
    | Writing and editing | Proposals, messages and product copy clear, specific and human; in the owner's voice when written for them | `design:ux-copy`, `brand-voice:brand-voice-enforcement`, `docs/brand-voice.md` |
    | Interface motion | Restrained; animation only where it explains what's happening (`docs/04-design.md` Motion) | `improve-animations`, `animate`, `emil-design-eng` |
    | Research and source checking | Official sources, existing products, current requirements; say what's confirmed and what's assumed | `deep-research`, WebSearch, vendor docs tools (Vercel, Cloudflare, Neon) |
    | Browser and device verification | Test the real product, keep evidence (`docs/evidence/`), and say whether a result is desktop, simulator or a real phone | `anthropic-skills:built-in-browser`, `run`, iOS simulator tools |
    | Documents and visuals | Create and inspect PDFs, Word, slides, spreadsheets, diagrams, design assets | `anthropic-skills:pdf`, `docx`, `pptx`, `xlsx`, `artifact-diagramming`, `figma:*` |
    | Infrastructure and integrations | GitHub, Cloudflare, APIs, databases, email delivery and services the owner has authorised; never outside that | `cloudflare:*`, `wrangler`, `neon-postgres`, `resend:resend`, Vercel tools, `gh` |

## Round one, 14 Oct: how should the work run up to the beta?

State on 14 Oct: `mobile-next` is 18 commits (130 files, +4,122 / −1,930) ahead of `main`, almost all the design audit batches 1–3 and the home copy cut from one day. Two batches (1C, 1D) sit on preview twice, once from the live-safe branch. Nine finished agent worktrees sit in `.claude/worktrees/`, all merged, none with changes. Usage widens 17 Oct; beta week 19 Oct.

**Release manager.** The preview is the biggest unshipped gap yet, built in a day. The longer it sits, the harder a partial ship gets. Ask the owner now which batches go live before 17 Oct, and make the ship branch from `main` with only those.

**Session coordinator.** Nine dead worktrees are noise and each one is a place a session can start from stale code. Clean them up (they are all merged). One session per branch at a time; a session that merges says so in the commit.

**QA.** Batch 2 changed phone review (docked rail, optimistic decisions, swipe v2): that is the review path, so it needs the full e2e run and a pass on a real phone before it ships, not only the simulator. Real-device upload and the email-client check are still open on the carried-over list and matter more than any UI before strangers send music.

**Docs keeper.** Each batch landed with its docs. This file joins the read table in `CLAUDE.md`.

**Ops on call.** Freeze new UI on 16 Oct so the weekend runs on code that has been live at least a day. Fixes only from then to 20 Oct.

**Owner's time.** The owner's list is getting long and scattered: R2 token scoped to `floortest-audio-eu`, the vault token, Turnstile hostnames, SPF/DMARC, old bucket delete on/after 18 Oct, the evaluation-only decision, which preview batches ship. Keep it as one list (below) and send it as one message.

**Scope guard.** Two blockers decide the beta, not design: the scanner on (`SCAN_URL`) and the lawyer's wording. Nothing new starts until the scanner has a date.

**Recommendation.** UI freeze 16 Oct; the owner picks what ships from preview by then; remaining dev time goes to the scanner going live, real-device upload and email checks; worktrees cleaned up.

## Round two, 14 Oct: the preview work through the product panel

What is on preview and not live: batch 1 (lime only for Keep and the one main call to action; one name per screen; senders keep their answers on errors; receipt "Send another"; 44px targets and contrast; Played out on any day), batch 2 (phone review: docked Not for me / Keep / Reply, swipe v2, decisions save in the background and roll back on error, All caught up), batch 3 (one set of shared controls, one track row, crate lists, Floor desk readout, Activity set log), and the shorter home copy. Read from the commits and docs, not walked on a phone.

**DJ / A&R.** Batch 2 is the one that changes the booth: the next track opens at once and the rail sits under the thumb. Worth shipping, but only after a real night's crate on a real phone, since a decision that rolls back late is worse than a slow one.

**Label owner.** Batch 3's shared controls touch every desk screen, team ones included. Ship it whole or not at all; half of it leaves two looks.

**Sender / producer.** Keeping answers after an error and "Send another" are pure wins and small. Ship batch 1C first.

**Designer.** Batch 1A (one light, one name) is the foundation the rest assumes; it goes with whatever ships.

**Engineer.** Batch 1 is small and low risk; a live-safe set of it was already split out on 14 Oct. Batches 2 and 3 are 100+ files together; take them after the beta weekend unless the e2e and a phone pass are clean by 16 Oct.

**Ops & support.** Optimistic saves mean a new kind of support report ("I kept it and it came back"). The error toast must say what happened in words; check that before shipping 2.

**Privacy & legal.** Played out any day still holds evaluation-only tracks back by name; no change. Home copy keeps the retention facts. Nothing here needs the lawyer.

**Recommendation.** Ship batch 1 and the home copy before 17 Oct (from a branch off `main`). Hold batches 2 and 3 to the week of 19 Oct, after a full e2e run and a real-phone pass.

## Round three, 14 Oct: what to work on next

**Scope guard.** Three days to the widening. Only what makes it safe for strangers to send music counts.

**QA.** Real-device upload test (large WAVs on slow and dropped mobile data, expired upload links) and the Gmail / Outlook / Apple Mail check. Both are carried over and neither is done.

**Ops on call.** The scanner live and in the uptime monitor; a restore drill that includes the vault once the owner's token is in.

**Release manager.** The batch 1 ship branch, prepared and checked, waiting on the owner's word.

**Product voices (DJ, label, sender).** The evaluation-only decision touches the send form every new sender sees in beta week; settle it before then, even if building it waits.

**Recommendation, in order.** 1) Scanner live (owner deploys, dev checks); 2) batch 1 ship branch ready; 3) real-device upload and email checks; 4) evaluation-only decided; 5) batches 2 and 3 after the weekend. Mobile app, sharing switch-on and stems stay after launch.

## Round four, 15 Oct: what goes live for the beta (Monday 19 Oct)

State on 15 Oct: production has almost everything. Live: sending, review (phone review with the docked rail), collections, Prepare and downloads, receipts with Delivered, Played out any day, account types, teams, Google sign-in, the new home, plans by request, ops with roles, the virus scanner (Cloudflare, London), the recovery vault code with its keys set, sign-in hardening, Vercel Pro with rate limits. Not on production yet: one small fix (the setup checklist drops "Make a collection" once a track has arrived without one) plus docs. Beta stays invite-only behind the site password; Paddle, collection sharing, the phone app and audio previews are after launch.

**Release manager.** Ship the checklist fix on Thursday from a branch off `main`; it's two files and has its e2e. After that, nothing new goes to `main` before Monday but fixes.

**Session coordinator.** Several sessions shipped on 14 and 15 Oct. From Friday, one session owns `main` until Monday; the others stay on `mobile-next`.

**QA.** The real-phone upload test and the Gmail / Outlook / Apple Mail check are still open. Friday, on the live site, with the owner's phone.

**Docs keeper.** `docs/06-plan.md` Done is current; the owner's list below is updated.

**Ops on call.** Freeze from Fri 16 Oct, as round one said. Check the vault actually ran (keys set 13 Oct, never confirmed) and that the uptime monitor watches the scanner's `/health`.

**Owner's time.** Four things only the owner can do before Monday: the lawyer's date, the evaluation-only call (or leave it as is for the beta), the vault check, the invite list.

**Scope guard.** Nothing new is built for the beta. Anything found in the weekend run is fixed; everything else waits for beta feedback.

**Recommendation.** Monday's beta is what is live now plus the checklist fix. Freeze Friday; Friday is the phone and email checks; Sunday the invites. If the lawyer has no date by Friday, Monday's invites go only to people the owner knows.

## Owner's list (one place)

| # | Item | When |
|---|---|---|
| 1 | ✅ Preview batches 1–4, the new home and account types shipped (14 Oct) | done |
| 2 | Evaluation-only decision (`06-plan.md`, Team decisions queued): for the beta it stays as it is unless decided by Fri 16 Oct | Fri 16 Oct |
| 3 | ✅ Scanner live on floortest.app (14 Oct, 18:03 UTC); mark the 401 incidents from the setup as handled in ops | done |
| 4 | Lawyer's wording on the legal pages: ask for a date by Fri 16 Oct; without it, Monday's invites go only to people the owner knows | Fri 16 Oct |
| 5 | Vault R2 token; app R2 token scoped to `floortest-audio-eu`; Turnstile hostnames | this week |
| 6 | ✅ `floortest-audio` deleted 14 Oct; left: delete the temporary token `bucket-move-temp` and cancel the stalled Data Migration | this week |
| 7 | SPF to Google only, DMARC reports (DNS) | this week |
| 8 | Check the vault ran: ops → Storage shows last night's copy and backup (keys set 13 Oct) | Fri 16 Oct |
| 9 | Write and send Monday's invites (who, how many, the invite codes) | Sun 18 Oct |

## Decision log

- 15 Oct: the owner's twelve working principles adopted (rule 12), with evidence reports, cloud-first sessions and at most one grouped production release a day (rule 13); urgent fixes excepted.

- 14 Oct: council started; UI freeze from 16 Oct recommended, pending the owner.
- 14 Oct: beta moved to Monday 19 Oct (owner); the 17 Oct widening is dropped. Scanner host: Cloudflare Containers (owner).
- 14 Oct: virus scanner live on floortest.app (Cloudflare Containers, London): test track scanned and on the desk at 18:03 UTC. One of the two beta blockers cleared; the lawyer's wording remains.
- 14 Oct: product panel recommends shipping batch 1 + home copy before 17 Oct and holding batches 2 and 3 to beta week, pending the owner.
- 14 Oct: batches 1–4 and the new home with the shorter copy shipped from another session (production `8159ac8`); the round two hold on batches 2 and 3 was overtaken by the owner's call.
- 14 Oct: account types shipped (production `28941c4`, migration 0095): seven types, tools on by default and never locked, Played out the first tool. Product panel round in the session; owner chose split Artist / Curator, defaults, build now.
- 14 Oct, slips on that ship, recorded so they don't repeat: `mobile-next` was pushed 32 s after `main` instead of 60; a merged branch (`scanner-cloudflare`) was deleted on GitHub without being asked; doc edits first landed in the shared checkout beside another session's uncommitted work and were moved out by hand. Rules 8–10 above come from this.
- 15 Oct: beta scope set (round four): what's live plus the checklist fix; freeze Fri 16 Oct; invites Sun 18 Oct.
