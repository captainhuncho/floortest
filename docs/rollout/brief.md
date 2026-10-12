# Rollout brief (12 Oct 2026): read this first

**Ask from the owner:** ideas for rolling FloorTest out, and for every public page, *what it should say and communicate* plus *image ideas*. "Let's not over explain, clear communications only and let the images speak." Reference site: untitled.stream ("almost a similar product"). Ideas must be on the owner's desk in the morning.

## Read in the repo (/Users/maxwelladjavon/floortest)
- `PRODUCT.md`: users, purpose, positioning (Honest signals), principles, **Launch Decisions (12 Oct)**: DJ/curators lead, teams are the upgrade; north star = tracks decided within 7 days; senders are a channel, never payers; website-only launch; markets UK, EU, Ghana, Nigeria; prices Free 20 tracks / Pro $6.99 / Team $19.99 (+$4 seats); beta users 6 months free then 50% off a year.
- `DESIGN.md`: "The Booth at 2am": Booth Black #10110f, Bone, one light (Cue Lime #d5ff48), JetBrains Mono everywhere, Instrument Serif italic only as a home-page accent. The crest logo (lime). Dark by default.
- `docs/brand-voice.md`: binding vocabulary and tone (booth-level plain, honest about signals, calm not hype, no exclamation marks, respect both sides of the desk). Words: your link, desk, Keep / Not for me, callout, crate, receipt, Delivered / Listened / Downloaded / Replied / Played out.
- `docs/01-product.md`: every feature (the public send page `floortest.app/<handle>`, receipts, collections/callouts with a brief, Review Queue, Prepare for set + Rekordbox XML, teams with approvals, share links held, apps later).
- Current home/pricing/sign-up/send-page copy: `src/lib/content.ts` (search for `f("`). Home today: eyebrow "The receiving desk for unreleased music", headline "From private tracks / to the DJ set.", How it works "Share once. Decide fast.", Receipts "Know what happened next.", Privacy "Music stays between the people you choose.", Plans "Start free. Grow when your inbox does.", FAQ "Before the first track lands."

## Public pages to cover
Home (`/`), Pricing (`/pricing`), Sign-up / Claim your link (`/signup`), Log in (`/login`), Waitlist (home `#waitlist`, invite-only), Coming soon (`/coming-soon`, the password gate in beta), the **public send page** (`/<handle>`: the receiver's link, what senders see), the **sender's receipt** (`/receipt/<token>`), Sent history (`/sent`), Trust / security (`/trust`), Contact, the 404, legal pages (light touch only). Also the first-run Floor (dashboard home) and the app-store listing (later).

## untitled.stream (studied 12 Oct)
A **creator's** home for work-in-progress music (organise, share links and see who listens, versions, offline, record ideas, pitch/speed, loop/trim, password links, Instagram story visualisers, "Made in Brooklyn"). Page = a short title line ("a sacred place for your work-in-progress music"), one CTA ("Enter App"), then a grid of feature tiles: each a 2–4 word heading + one sentence, carried by app screenshots; black, minimal, bracketed wordmark `[untitled]`; iOS/Android/Mac. **It sits on the sending/making side; FloorTest is the receiving side** (where that music lands on a DJ's or label's desk, gets heard, decided on and taken to the set, with an honest receipt back to the sender). Borrow the restraint (short tiles, screenshots doing the work), not the positioning. Don't copy their wording.

## Ground rules for everyone
- Short. A heading of a few words and at most one line under it. No paragraphs of explanation.
- Images carry the meaning: say what the image *shows* (scene, subject, light, composition, what's on screen), so a photographer or designer could shoot or build it.
- Honest signals: never claim more than the product does (no "verified artist", no invented stats, testimonials, logos or press: none exist yet). Use placeholders like "[first partner quote]" if needed.
- Real scenes: London and Lagos (Afro house, amapiano, house), booths, laptops between gigs, phones in a club, a producer's bedroom studio. Diverse, real people; no stock-photo poses.
- Brand voice rules are binding (no exclamation marks, no hype words, "track" not "song", "Keep / Not for me").
- Number your ideas so the owner can say "do 3 and 7".
