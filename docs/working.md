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

## Owner's list (one place)

| # | Item | When |
|---|---|---|
| 1 | Pick which preview batches ship (or none) | by 16 Oct |
| 2 | Evaluation-only decision (`06-plan.md`, Team decisions queued) | before beta week |
| 3 | Scanner on Cloudflare Containers (blocker): Workers Paid back on, read-only R2 key, `wrangler login`, then `SCAN_URL` in Vercel (`scanner/README.md`) | by Fri 16 Oct, 18:00 |
| 4 | Lawyer's wording on the legal pages (blocker) | before strangers send |
| 5 | Vault R2 token; app R2 token scoped to `floortest-audio-eu`; Turnstile hostnames | this week |
| 6 | Delete `floortest-audio` and its stalled migration | on/after 18 Oct |
| 7 | SPF to Google only, DMARC reports (DNS) | this week |

## Decision log

- 14 Oct: council started; UI freeze from 16 Oct recommended, pending the owner.
- 14 Oct: beta moved to Monday 19 Oct (owner); the 17 Oct widening is dropped. Scanner host: Cloudflare Containers (owner).
- 14 Oct: product panel recommends shipping batch 1 + home copy before 17 Oct and holding batches 2 and 3 to beta week, pending the owner.
