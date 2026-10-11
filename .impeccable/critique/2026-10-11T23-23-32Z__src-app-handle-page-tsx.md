---
target: public send page
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/maxwelladjavon/floortest/src/app/[handle]/page.tsx"
target_fingerprint: "sha256:dc4e8aef4f781eaaeb9bfe381fd8070b244c3778177513a7d9f9dde884d8fdfb"
target_path: /Users/maxwelladjavon/floortest/src/app/[handle]/page.tsx
timestamp: 2026-10-11T23-23-32Z
slug: src-app-handle-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score — 28/40 (Good, bottom of band)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Real transfer progress; but the header re-expands on success; "Reading audio…" only on the button |
| 2 | Match system / real world | 3 | Scene language; "3 tracks" tab reads as a count, not a choice |
| 3 | User control and freedom | 3 | Remove/Cancel/Back exist; refresh at step 2 loses file and answers |
| 4 | Consistency and standards | 2 | 5 lime spots on step 1; static chips look tappable; success ladder omits Downloaded while copy promises it |
| 5 | Error prevention | 3 | Type/size/count checked early; genre not prefilled from the brief |
| 6 | Recognition rather than recall | 3 | Brief (BPM, note) hidden at step 2 exactly when the sender picks genre |
| 7 | Flexibility and efficiency | 3 | Remembered details still shown as 4 full inputs |
| 8 | Aesthetic and minimalist | 3 | Calm; team privacy said twice; closed link still shows hand-off bullets |
| 9 | Error recovery | 3 | Kind, specific errors, but one at a time (up to 8 submits on a phone); failed artwork silently swallowed |
| 10 | Help and documentation | 2 | No "what happens to my track"; reassurance only in 11px bullets |

## Design specificity
Voice and type are FloorTest's; composition is a generic link-in-bio stack over a stock dashed upload box. Brief rendered as decorative chips, not a readout the sender works against. Desktop: 576px column, ~430px dead space each side at 1440.
Detector: CLI exit 0, 21 advisory design-system-font-size findings (17 of 12/14px are false positives per DESIGN.md prose; 22px at SubmitForm.tsx:161 and TransferScreen.tsx:50 are real; h1 renders 56/45px off-ramp). Browser: 4 tiny-text (11px reassurance prose: the three bullets and the reopen hint). Contrast passes everywhere (dim 6.2:1). "Report impersonation" tap area 34px on phones.

## Priority issues
1. [P1] Reassurance buried and gone at commitment (page.tsx:155-162 11px dim bullets below the drop zone, hidden once a file is picked; SubmitForm.tsx:451 legal 11px) — /impeccable clarify
2. [P1] "What I'm looking for" shows the 17 default genres when the receiver set none (page.tsx:69, genresFor) — claims an ask never made; static chips look tappable — /impeccable clarify + harden
3. [P1] Step 2 is a wall on phones: ~10 required decisions, one error per submit, Send at the very bottom, native selects — /impeccable distill + adapt
4. [P2] Success moment jumps (hero/brief/mode switch re-render above it) and the ladder omits Downloaded (SubmitForm.tsx:170 vs 178); multi-track receipts go to /sent which re-asks email — /impeccable polish
5. [P2] One-light rule bent (verified mark, callout name, selected tab text, CTA, crest, lime eyebrow on the code step) and wasted desktop width — /impeccable quieter + layout

## Persona red flags
Jordan: verified mark explained only by hover tooltip; "3 tracks / Folder" unclear; no help link.
Casey: CTA ~700px down on a 375 phone; long step 2; leaving for the mail app can evict the tab and lose the file.
Riley: refresh loses everything; same-name files collide in TransferScreen keys; stray line break renders "evaluate it ." ; long callout names unclamped.
First-demo producer: reassurance tiny then gone; 17-genre "looking for" breeds doubt; AI + legal block reads as suspicion at the nervous moment.

## Minor
Label tracking 0.5px vs eyebrow 1px; lime eyebrow on EmailCode; role=tablist without tabpanel/arrow keys; "&" in "Fully mixed & mastered"; receiver note in 11px italic.

## Questions to consider
Make the drop zone itself the promise (show the signal ladder before upload)? Let the brief be answered (tap genre, see BPM fit) rather than read? Start the upload the moment a file is chosen so the wait and the form overlap?
